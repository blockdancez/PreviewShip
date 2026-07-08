#!/usr/bin/env python3
"""将 Claude Code 本地会话 JSONL 渲染为可分享的自包含 HTML。"""

from __future__ import annotations

import argparse
import base64
import hashlib
import html
import io
import json
import mimetypes
import re
import subprocess
import sys
import unicodedata
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any


DATA_IMAGE_RE = re.compile(r"^data:(image/[a-zA-Z0-9.+-]+);base64,(.+)$", re.DOTALL)
SECRET_PATTERNS = [
    re.compile(r"\bps_live_[A-Za-z0-9_.-]*"),
    re.compile(r"\bsk-[A-Za-z0-9][A-Za-z0-9_.-]{16,}"),
    re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}"),
    re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{16,}"),
    re.compile(r"\b[A-Za-z0-9._%+-]+_API_KEY\s*=\s*[^\s]+", re.IGNORECASE),
    re.compile(r"\b(?:api[_-]?key|token|password|secret)\s*[:=]\s*([^\s,;]+)", re.IGNORECASE),
]
HIDDEN_PREFIXES = (
    "# AGENTS.md instructions",
    "AGENTS.md instructions",
    "<environment_context>",
    "<skill>",
    "<system-reminder>",
)
IGNORED_RECORD_TYPES = {
    "system",
    "permission-mode",
    "file-history-snapshot",
    "last-prompt",
}
ATTACHMENT_TYPES = {
    "file": "文件",
    "directory": "目录",
    "opened_file_in_ide": "IDE 打开的文件",
    "selected_lines_in_ide": "IDE 选区",
}
THUMBNAIL_MAX_SIZE = (240, 240)
MD_SCRIPT = str(Path(__file__).resolve().parent / "md.mjs")
_MD_CACHE: dict[str, str] = {}


def redact_sensitive_text(value: str) -> str:
    text = str(value)
    for pattern in SECRET_PATTERNS:
        text = pattern.sub("REDACTED_SECRET", text)
    return text


def escape_text(value: Any) -> str:
    return html.escape(redact_sensitive_text(str(value)), quote=True)


def slugify(value: str, fallback: str = "claude-code-chat", max_length: int = 64) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", normalized).strip("-").lower()
    slug = re.sub(r"-{2,}", "-", slug)
    return slug[:max_length].strip("-") or fallback


def stable_project_name(title: str, identity: str = "") -> str:
    base = slugify(title or "claude-code-chat", fallback="claude-code-chat", max_length=52)
    if not identity:
        return base
    suffix = hashlib.sha1(identity.encode("utf-8")).hexdigest()[:8]
    max_base = 64 - len(suffix) - 1
    return f"{slugify(base, max_length=max_base)}-{suffix}"


def is_hidden_context_message(content: str) -> bool:
    stripped = content.strip()
    if not stripped:
        return False
    if any(stripped.startswith(prefix) for prefix in HIDDEN_PREFIXES):
        return True
    if stripped.startswith("<skill>\n<name>") and stripped.endswith("</skill>"):
        return True
    return False


def load_transcript_data(input_path: Path) -> dict[str, Any]:
    raw = input_path.read_text(encoding="utf-8")
    stripped = raw.lstrip()
    if stripped.startswith("{"):
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return claude_jsonl_to_data(raw, input_path)
        if not isinstance(data, dict):
            raise ValueError("transcript JSON 必须是对象")
        return data
    if stripped.startswith("["):
        messages = json.loads(raw)
        if not isinstance(messages, list):
            raise ValueError("transcript JSON 数组必须包含消息对象")
        return {"title": "Claude Code Chat", "messages": messages}
    return claude_jsonl_to_data(raw, input_path)


def claude_jsonl_to_data(raw: str, input_path: Path) -> dict[str, Any]:
    records: list[dict[str, Any]] = []
    for line_no, line in enumerate(raw.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"第 {line_no} 行不是合法 JSONL") from exc
        if isinstance(item, dict):
            records.append(item)

    messages: list[dict[str, Any]] = []
    pending_tools: list[dict[str, str]] = []
    pending_context: list[dict[str, str]] = []
    ignored = Counter()

    def attach_pending_tools_to_previous() -> None:
        nonlocal pending_tools
        if not pending_tools:
            return
        if messages and messages[-1].get("role") == "assistant":
            messages[-1]["tools"] = merge_tools(messages[-1].get("tools", []), pending_tools)
            messages[-1]["toolsPosition"] = "after"
        else:
            messages.append({"role": "assistant", "content": "", "tools": pending_tools, "toolsPosition": "before"})
        pending_tools = []

    def append_message(message: dict[str, Any]) -> None:
        if message["role"] == "assistant" and pending_tools:
            if messages and messages[-1].get("role") == "assistant":
                messages[-1]["tools"] = merge_tools(messages[-1].get("tools", []), pending_tools)
                messages[-1]["toolsPosition"] = "after"
            else:
                message["tools"] = merge_tools(pending_tools, message.get("tools", []))
                message["toolsPosition"] = "before"
            pending_tools.clear()
        if message["role"] == "user" and pending_context:
            message["context"] = merge_context(message.get("context", []), pending_context)
            pending_context.clear()

        if messages and can_merge(messages[-1], message):
            messages[-1]["content"] = join_nonempty([messages[-1].get("content", ""), message.get("content", "")])
            messages[-1]["attachments"] = [*messages[-1].get("attachments", []), *message.get("attachments", [])]
            messages[-1]["context"] = merge_context(messages[-1].get("context", []), message.get("context", []))
            messages[-1]["tools"] = merge_tools(messages[-1].get("tools", []), message.get("tools", []))
            if message.get("toolsPosition"):
                messages[-1]["toolsPosition"] = message.get("toolsPosition")
            messages[-1]["timestamp"] = message.get("timestamp") or messages[-1].get("timestamp", "")
            return
        messages.append(message)

    for record in records:
        if record.get("isSidechain") is True:
            ignored["sidechain"] += 1
            continue

        record_type = str(record.get("type") or "").strip()
        if record_type in IGNORED_RECORD_TYPES:
            ignored[record_type] += 1
            continue

        if record_type == "attachment":
            context = context_from_attachment_record(record)
            if context:
                pending_context = merge_context(pending_context, [context])
            continue

        message = record.get("message")
        if not isinstance(message, dict):
            ignored[record_type or "unknown"] += 1
            continue

        role = str(message.get("role") or record_type or "").strip().lower()
        content = message.get("content")
        visible_text, attachments, tools = parse_claude_content(content)
        timestamp = format_timestamp(record.get("timestamp"))

        if tools:
            pending_tools = merge_tools(pending_tools, tools)

        if role == "user":
            if visible_text or attachments:
                attach_pending_tools_to_previous()
                append_message(
                    {
                        "role": "user",
                        "content": visible_text,
                        "attachments": attachments,
                        "timestamp": timestamp,
                    }
                )
            continue

        if role == "assistant":
            if visible_text:
                append_message(
                    {
                        "role": "assistant",
                        "content": visible_text,
                        "attachments": attachments,
                        "timestamp": timestamp,
                    }
                )
            continue

        ignored[record_type or role or "unknown"] += 1

    attach_pending_tools_to_previous()
    messages = normalize_messages({"messages": messages})
    if not messages:
        raise ValueError("Claude Code JSONL 中没有可渲染的可见消息")

    meta = metadata_from_records(records, input_path)
    if ignored:
        meta["ignoredSummary"] = ", ".join(f"{key}:{value}" for key, value in sorted(ignored.items()))
    return {**meta, "messages": messages}


def parse_claude_content(content: Any) -> tuple[str, list[dict[str, str]], list[dict[str, str]]]:
    text_parts: list[str] = []
    attachments: list[dict[str, str]] = []
    tools: list[dict[str, str]] = []

    if isinstance(content, str):
        if content.strip() and not is_hidden_context_message(content):
            text_parts.append(content.strip())
        return "\n\n".join(text_parts), attachments, tools

    if not isinstance(content, list):
        return "", attachments, tools

    for item in content:
        if isinstance(item, str):
            if item.strip():
                text_parts.append(item.strip())
            continue
        if not isinstance(item, dict):
            continue
        item_type = str(item.get("type") or "").lower()
        if item_type == "text":
            text = str(item.get("text") or "").strip()
            if text and not is_hidden_context_message(text):
                text_parts.append(text)
        elif item_type == "image":
            attachment = image_attachment_from_item(item)
            if attachment:
                attachments.append(attachment)
        elif item_type == "tool_use":
            tools.append(tool_summary_from_use(item))
        elif item_type == "tool_result":
            tools.append(tool_summary_from_result(item))
        elif item_type == "thinking":
            tools.append({"name": "Thinking", "summary": "Claude Code 思考过程已隐藏。", "status": "thinking", "id": ""})
    return "\n\n".join(text_parts), attachments, compact_tool_results(tools)


def image_attachment_from_item(item: dict[str, Any]) -> dict[str, str] | None:
    source = item.get("source")
    if isinstance(source, dict):
        if source.get("type") == "base64" and source.get("data") and source.get("media_type"):
            return {
                "src": f"data:{source.get('media_type')};base64,{source.get('data')}",
                "alt": "Claude Code 图片",
            }
        url = source.get("url") or source.get("path") or source.get("file_path")
        if url:
            return {"src": str(url), "alt": "Claude Code 图片"}
    src = item.get("src") or item.get("url") or item.get("path") or item.get("file_path")
    return {"src": str(src), "alt": "Claude Code 图片"} if src else None


def tool_summary_from_use(item: dict[str, Any]) -> dict[str, str]:
    name = str(item.get("name") or "Tool").strip()
    tool_input = item.get("input") if isinstance(item.get("input"), dict) else {}
    summary = summarize_tool_input(name, tool_input)
    return {"name": name, "summary": summary, "status": "started", "id": str(item.get("id") or "")}


def tool_summary_from_result(item: dict[str, Any]) -> dict[str, str]:
    status = "failed" if item.get("is_error") else "completed"
    summary = safe_tool_result_summary(item.get("content")) or "工具结果已返回，原始输出未公开。"
    return {"name": "Tool result", "summary": summary, "status": status, "id": str(item.get("tool_use_id") or "")}


def safe_tool_result_summary(content: Any) -> str:
    text = safe_text_from_tool_result(content)
    if not text:
        return ""
    received = re.search(r"Received\s+[0-9.]+\s*[KMGTP]?B\s+\(\d{3}\s+[^)\n]{1,40}\)", text, re.IGNORECASE)
    if received:
        return received.group(0)
    if re.fullmatch(r"\s*(?:Fetching|Fetched|Reading|Read|Searching|Writing|Edited|Done|Completed|Success|Failed|Error)[^\n]{0,120}", text, re.IGNORECASE):
        return shorten(redact_sensitive_text(text.strip()), 140)
    return ""


def safe_text_from_tool_result(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
        return "\n".join(parts)
    return ""


def summarize_tool_input(name: str, tool_input: dict[str, Any]) -> str:
    candidates = [
        "file_path",
        "path",
        "pattern",
        "glob",
        "url",
        "description",
        "subject",
        "taskId",
        "status",
    ]
    if name.lower() == "bash" and tool_input.get("command"):
        return "Shell 命令已隐藏，避免公开终端细节。"
    for key in candidates:
        value = tool_input.get(key)
        if value:
            return shorten(redact_sensitive_text(str(value)), 160)
    if not tool_input:
        return ""
    keys = ", ".join(sorted(str(key) for key in tool_input.keys())[:5])
    return f"参数：{keys}"


def compact_tool_results(tools: list[dict[str, str]]) -> list[dict[str, str]]:
    compacted: list[dict[str, str]] = []
    by_id: dict[str, dict[str, str]] = {}
    orphan_results = 0
    for tool in tools:
        tool_id = str(tool.get("id") or "")
        if tool.get("name") == "Tool result":
            if tool_id and tool_id in by_id:
                target = by_id[tool_id]
                target["status"] = tool.get("status") or target.get("status", "")
                result_summary = str(tool.get("summary") or "")
                if result_summary and result_summary != "工具结果已返回，原始输出未公开。":
                    target["result"] = result_summary
            elif tool_id:
                compacted.append(tool)
            else:
                orphan_results += 1
            continue
        compacted.append(tool)
        if tool_id:
            by_id[tool_id] = tool
    if orphan_results:
        compacted.append(
            {
                "name": "Tool result",
                "summary": f"{orphan_results} 个工具结果已返回，原始输出未公开。",
                "status": "completed",
                "id": "",
            }
        )
    return compacted


def context_from_attachment_record(record: dict[str, Any]) -> dict[str, str] | None:
    attachment = record.get("attachment")
    if not isinstance(attachment, dict):
        return None
    attachment_type = str(attachment.get("type") or "").strip()
    if attachment_type not in ATTACHMENT_TYPES:
        return None
    path = str(
        attachment.get("displayPath")
        or attachment.get("filename")
        or attachment.get("path")
        or attachment.get("filePath")
        or ""
    ).strip()
    if not path:
        return None
    title = Path(path).name if "/" in path else path
    if attachment_type == "selected_lines_in_ide":
        line_start = attachment.get("lineStart")
        line_end = attachment.get("lineEnd")
        line_label = f" · L{line_start}-L{line_end}" if line_start and line_end else ""
    else:
        line_label = ""
    return {
        "title": title,
        "subtitle": f"{ATTACHMENT_TYPES[attachment_type]}{line_label}",
        "path": path,
    }


def metadata_from_records(records: list[dict[str, Any]], input_path: Path) -> dict[str, Any]:
    cwd = ""
    session_id = input_path.stem
    branch = ""
    created = ""
    updated = ""
    for record in records:
        cwd = cwd or str(record.get("cwd") or "")
        session_id = str(record.get("sessionId") or session_id)
        branch = str(record.get("gitBranch") or branch or "")
        ts = format_timestamp(record.get("timestamp"))
        if ts and not created:
            created = ts
        if ts:
            updated = ts
    title = f"{Path(cwd).name} Claude Code Chat" if cwd else "Claude Code Chat"
    source_path = str(input_path.expanduser().resolve())
    return {
        "title": title,
        "projectName": stable_project_name(title, session_id or source_path),
        "sessionId": session_id,
        "cwd": cwd,
        "gitBranch": branch,
        "createdAt": created,
        "updatedAt": updated,
        "sourcePath": source_path,
    }


def normalize_messages(data: dict[str, Any]) -> list[dict[str, Any]]:
    raw_messages = data.get("messages")
    if not isinstance(raw_messages, list):
        raise ValueError("transcript JSON 必须包含 messages 数组")
    normalized: list[dict[str, Any]] = []
    for index, message in enumerate(raw_messages, start=1):
        if not isinstance(message, dict):
            raise ValueError(f"第 {index} 条消息必须是对象")
        if message.get("visible") is False:
            continue
        role = str(message.get("role") or "").strip().lower()
        if role not in {"user", "assistant"}:
            continue
        content = redact_sensitive_text(str(message.get("content") or "").strip())
        if is_hidden_context_message(content):
            continue
        attachments = normalize_list_of_dicts(message.get("attachments"))
        context = normalize_list_of_dicts(message.get("context") or message.get("artifacts"))
        tools = normalize_list_of_dicts(message.get("tools"))
        if not (content or attachments or context or tools):
            continue
        normalized.append(
            {
                "role": role,
                "content": content,
                "attachments": attachments,
                "context": context,
                "tools": tools,
                "toolsPosition": str(message.get("toolsPosition") or "before").strip(),
                "timestamp": str(message.get("timestamp") or "").strip(),
            }
        )
    return normalized


def normalize_list_of_dicts(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def can_merge(left: dict[str, Any], right: dict[str, Any]) -> bool:
    if left.get("role") != right.get("role"):
        return False
    if left.get("role") == "assistant":
        return not right.get("tools") and not left.get("tools")
    return False


def merge_context(existing: list[Any], new_items: list[Any]) -> list[dict[str, str]]:
    merged: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for item in [*existing, *new_items]:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or item.get("name") or "").strip()
        path = str(item.get("path") or item.get("file") or "").strip()
        if not title and path:
            title = Path(path).name
        if not title:
            continue
        key = (title, path)
        if key in seen:
            continue
        seen.add(key)
        merged.append(
            {
                "title": title,
                "subtitle": str(item.get("subtitle") or item.get("type") or "上下文").strip(),
                "path": path,
            }
        )
    return merged


def merge_tools(existing: list[Any], new_items: list[Any]) -> list[dict[str, str]]:
    merged: list[dict[str, str]] = []
    by_id: dict[str, dict[str, str]] = {}
    orphan_results = 0
    for item in [*existing, *new_items]:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "Tool").strip()
        summary = redact_sensitive_text(str(item.get("summary") or "").strip())
        status = str(item.get("status") or "").strip()
        tool_id = str(item.get("id") or "").strip()
        result = redact_sensitive_text(str(item.get("result") or "").strip())
        if name == "Tool result":
            if tool_id and tool_id in by_id:
                target = by_id[tool_id]
                target["status"] = status or target.get("status", "")
                if summary and summary != "工具结果已返回，原始输出未公开。":
                    target["result"] = summary
            else:
                orphan_results += 1
            continue
        if name or summary:
            row = {"name": name, "summary": summary, "status": status, "id": tool_id, "result": result}
            merged.append(row)
            if tool_id:
                by_id[tool_id] = row
    if orphan_results:
        merged.append(
            {
                "name": "Tool result",
                "summary": f"{orphan_results} 个工具结果已返回，原始输出未公开。",
                "status": "completed",
                "id": "",
                "result": "",
            }
        )
    return merged


def join_nonempty(parts: list[str]) -> str:
    return "\n\n".join(str(part).strip() for part in parts if str(part).strip())


def shorten(value: str, max_len: int) -> str:
    value = " ".join(str(value).split())
    if len(value) <= max_len:
        return value
    return value[: max_len - 1].rstrip() + "…"


def format_timestamp(value: Any) -> str:
    if not value:
        return ""
    raw = str(value)
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return parsed.strftime("%Y-%m-%d %H:%M")
    except Exception:
        return raw[:16]


def render_markdown_batch(markdowns: list[str]) -> None:
    pending = [item for item in dict.fromkeys(markdowns) if item and item not in _MD_CACHE]
    if not pending:
        return
    payload = json.dumps({"items": [redact_sensitive_text(item) for item in pending]})
    htmls: list[str] = []
    try:
        proc = subprocess.run(["node", MD_SCRIPT], input=payload, capture_output=True, text=True, timeout=60)
        htmls = (json.loads(proc.stdout) or {}).get("html") or []
    except Exception:
        htmls = []
    for index, markdown in enumerate(pending):
        _MD_CACHE[markdown] = htmls[index] if index < len(htmls) else fallback_markdown(markdown)


def render_markdown(markdown: str) -> str:
    if not markdown.strip():
        return ""
    if markdown not in _MD_CACHE:
        render_markdown_batch([markdown])
    return _MD_CACHE.get(markdown, fallback_markdown(markdown))


def fallback_markdown(markdown: str) -> str:
    paragraphs = [f"<p>{escape_text(part)}</p>" for part in re.split(r"\n{2,}", markdown) if part.strip()]
    return "".join(paragraphs)


def resolve_image_src(src: str) -> tuple[str, bool]:
    if not src:
        return "", False
    if src.startswith(("http://", "https://")):
        return src, True
    if src.startswith("data:"):
        return thumbnail_data_url(src), True
    path = Path(src).expanduser()
    if not path.exists() or not path.is_file():
        return "", False
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    if not mime.startswith("image/"):
        return "", False
    return thumbnail_bytes_to_data_url(path.read_bytes(), mime), True


def thumbnail_data_url(src: str) -> str:
    match = DATA_IMAGE_RE.match(src)
    if not match:
        return src
    mime, payload = match.groups()
    try:
        raw = base64.b64decode(payload, validate=False)
    except Exception:
        return src
    return thumbnail_bytes_to_data_url(raw, mime, fallback=src)


def thumbnail_bytes_to_data_url(raw: bytes, mime: str, fallback: str = "") -> str:
    try:
        from PIL import Image
    except Exception:
        return fallback or f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"
    try:
        with Image.open(io.BytesIO(raw)) as image:
            image.thumbnail(THUMBNAIL_MAX_SIZE)
            if image.mode in {"RGBA", "LA"}:
                background = Image.new("RGB", image.size, (255, 255, 255))
                background.paste(image.convert("RGB"), mask=image.getchannel("A"))
                image = background
            else:
                image = image.convert("RGB")
            out = io.BytesIO()
            try:
                image.save(out, format="WEBP", quality=76, method=6)
                return f"data:image/webp;base64,{base64.b64encode(out.getvalue()).decode('ascii')}"
            except Exception:
                out = io.BytesIO()
                image.save(out, format="JPEG", quality=78, optimize=True)
                return f"data:image/jpeg;base64,{base64.b64encode(out.getvalue()).decode('ascii')}"
    except Exception:
        return fallback or f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"


def render_html(data: dict[str, Any]) -> str:
    title = str(data.get("title") or "Claude Code Chat")
    messages = normalize_messages(data)
    render_markdown_batch([str(message.get("content") or "") for message in messages])
    rendered = "\n".join(render_message(message) for message in messages)
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{escape_text(title)}</title>
  <style>{PAGE_CSS}</style>
</head>
<body>
  <div class="shell">
    <header class="hero">
      <div>
        <p class="eyebrow">Claude Code Conversation</p>
        <h1>{escape_text(title)}</h1>
        {render_meta(data)}
      </div>
      <div class="brand-mark" aria-hidden="true">CC</div>
    </header>
    <main class="conversation" aria-label="Claude Code 对话">
      {rendered}
    </main>
  </div>
</body>
</html>
"""


def render_meta(data: dict[str, Any]) -> str:
    items = []
    if data.get("cwd"):
        items.append(("Project", str(data["cwd"])))
    if data.get("gitBranch"):
        items.append(("Branch", str(data["gitBranch"])))
    if data.get("updatedAt"):
        items.append(("Updated", str(data["updatedAt"])))
    if data.get("sessionId"):
        items.append(("Session", str(data["sessionId"])[:8]))
    if not items:
        return ""
    return '<div class="meta">' + "".join(
        f'<span><b>{escape_text(label)}</b>{escape_text(shorten(value, 80))}</span>' for label, value in items
    ) + "</div>"


def render_message(message: dict[str, Any]) -> str:
    role = message["role"]
    content = str(message.get("content") or "")
    context = render_context_cards(message.get("context", []))
    attachments = render_attachments(message.get("attachments", []))
    timestamp = f'<span class="time">{escape_text(message.get("timestamp", ""))}</span>' if message.get("timestamp") else ""
    if role == "user":
        body = f'<div class="bubble user-bubble">{render_user_text(content)}</div>' if content.strip() else ""
        return f'<section class="turn turn-user">{attachments}{context}{body}{timestamp}</section>'
    tools = render_tool_group(message.get("tools", []))
    body_html = f'<div class="markdown-body">{render_markdown(content)}</div>' if content.strip() else ""
    if message.get("toolsPosition") == "after":
        body = f'<div class="assistant-card">{body_html}{tools}{attachments}{context}{timestamp}</div>'
    else:
        body = f'<div class="assistant-card">{tools}{body_html}{attachments}{context}{timestamp}</div>'
    return f'<section class="turn turn-assistant">{body}</section>'


def render_user_text(content: str) -> str:
    return escape_text(content).replace("\n", "<br />")


def render_attachments(attachments: list[Any]) -> str:
    rendered = []
    for attachment in attachments:
        if not isinstance(attachment, dict):
            continue
        src = str(attachment.get("src") or attachment.get("url") or "").strip()
        alt = str(attachment.get("alt") or "图片").strip()
        resolved, ok = resolve_image_src(src)
        if ok:
            rendered.append(f'<figure class="image-thumb"><img src="{escape_text(resolved)}" alt="{escape_text(alt)}" /></figure>')
    return f'<div class="attachments">{"".join(rendered)}</div>' if rendered else ""


def render_context_cards(items: list[Any]) -> str:
    cards = []
    for item in items:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or item.get("name") or "").strip()
        subtitle = str(item.get("subtitle") or item.get("type") or "上下文").strip()
        path = str(item.get("path") or "").strip()
        if not title and path:
            title = Path(path).name
        if not title:
            continue
        cards.append(
            f"""
            <div class="context-card">
              <div class="context-icon">◇</div>
              <div class="context-main">
                <div class="context-title">{escape_text(title)}</div>
                <div class="context-subtitle">{escape_text(subtitle)}{f' · {escape_text(shorten(path, 72))}' if path else ''}</div>
              </div>
            </div>"""
        )
    return f'<div class="context-grid">{"".join(cards)}</div>' if cards else ""


def render_tool_group(tools: list[Any]) -> str:
    rows = []
    for tool in tools:
        if not isinstance(tool, dict):
            continue
        name = str(tool.get("name") or "Tool")
        summary = str(tool.get("summary") or "")
        status = str(tool.get("status") or "")
        result = str(tool.get("result") or "")
        status_label = {
            "thinking": "思考",
            "started": "运行中",
            "completed": "完成",
            "failed": "失败",
        }.get(status, status)
        rows.append(
            f"""
            <div class="tool-row">
              <span class="tool-dot tool-dot-{escape_text(status or 'started')}"></span>
              <div class="tool-copy">
                <div class="tool-title">
                  <span class="tool-name">{escape_text(name)}</span>
                  {f'<span class="tool-status tool-status-{escape_text(status)}">{escape_text(status_label)}</span>' if status_label else ''}
                </div>
                <div class="tool-summary">{render_tool_summary(summary or "工具活动已摘要，原始输出未公开。")}</div>
                {f'<div class="tool-result">{escape_text(result)}</div>' if result else ''}
              </div>
            </div>"""
        )
    if not rows:
        return ""
    return f"""
      <details class="tool-group">
        <summary><span>处理过程 {len(rows)} 项</span><span class="tool-chevron">›</span></summary>
        <div class="tool-list">{''.join(rows)}</div>
      </details>"""


def render_tool_summary(summary: str) -> str:
    text = summary.strip()
    if re.fullmatch(r"https?://[^\s<>\"]+", text):
        href = escape_text(text)
        return f'<a href="{href}" target="_blank" rel="noreferrer">{href}</a>'
    return escape_text(text)


def project_name_from_data(data: dict[str, Any]) -> str:
    for key in ("projectName", "project_name"):
        value = str(data.get(key) or "").strip()
        if value:
            return slugify(value)
    identity = str(data.get("sessionId") or data.get("sourcePath") or "").strip()
    return stable_project_name(str(data.get("title") or "Claude Code Chat"), identity)


def find_current_session() -> Path:
    root = Path.home() / ".claude" / "projects"
    if not root.exists():
        raise FileNotFoundError("未找到 ~/.claude/projects；请确认 Claude Code 已生成本地会话")
    candidates = [path for path in root.rglob("*.jsonl") if path.is_file() and is_main_session_path(path)]
    if not candidates:
        raise FileNotFoundError("未找到 Claude Code 会话 JSONL；可用 --input 指定文件")
    return max(candidates, key=lambda path: path.stat().st_mtime)


def recent_sessions(limit: int = 12) -> list[Path]:
    root = Path.home() / ".claude" / "projects"
    if not root.exists():
        return []
    return sorted(
        (path for path in root.rglob("*.jsonl") if path.is_file() and is_main_session_path(path)),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )[:limit]


def is_main_session_path(path: Path) -> bool:
    return "subagents" not in path.parts and path.name.endswith(".jsonl")


def print_recent_sessions() -> None:
    for path in recent_sessions():
        try:
            data = load_transcript_data(path)
            title = data.get("title") or "Claude Code Chat"
            updated = data.get("updatedAt") or ""
        except Exception:
            title = "Claude Code Chat"
            updated = ""
        print(f"{updated}\t{title}\t{path}")


PAGE_CSS = """
:root {
  color-scheme: light;
  --bg: #f6f3ec;
  --paper: #fffdf8;
  --paper-2: #fbf8f0;
  --ink: #201d18;
  --muted: rgba(32, 29, 24, 0.58);
  --line: rgba(67, 54, 38, 0.14);
  --accent: #c15f3c;
  --accent-dark: #7d321f;
  --code-bg: #26231f;
  --code-text: #f5eee2;
  --shadow: 0 24px 80px rgba(64, 46, 24, 0.11);
  --font-sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  --font-mono: "SFMono-Regular", "SF Mono", ui-monospace, Menlo, Consolas, monospace;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at 16% 0%, rgba(193, 95, 60, 0.13), transparent 28rem),
    linear-gradient(180deg, #fbf8f1 0%, var(--bg) 42%, #efe8dc 100%);
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.58;
  -webkit-font-smoothing: antialiased;
}
.shell { max-width: 980px; margin: 0 auto; padding: 36px 20px 72px; }
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 24px;
  align-items: start;
  padding: 28px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: rgba(255, 253, 248, 0.78);
  box-shadow: var(--shadow);
  backdrop-filter: blur(16px);
}
.eyebrow { margin: 0 0 8px; color: var(--accent-dark); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
h1 { margin: 0; font-size: clamp(28px, 4vw, 44px); line-height: 1.04; font-weight: 650; letter-spacing: 0; }
.brand-mark {
  width: 52px; height: 52px; display: grid; place-items: center;
  border-radius: 16px; background: #211d18; color: #f7ead8;
  font-weight: 750; letter-spacing: .02em;
}
.meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
.meta span {
  display: inline-flex; gap: 6px; align-items: center; max-width: 100%;
  padding: 6px 10px; border: 1px solid var(--line); border-radius: 999px;
  background: rgba(255, 255, 255, 0.55); color: var(--muted); font-size: 12px;
}
.meta b { color: var(--ink); font-weight: 650; }
.conversation { display: flex; flex-direction: column; gap: 22px; margin-top: 28px; }
.turn { display: flex; flex-direction: column; min-width: 0; }
.turn-user { align-items: flex-end; }
.turn-assistant { align-items: flex-start; }
.bubble {
  max-width: min(78%, 720px);
  padding: 12px 15px;
  border-radius: 18px;
  overflow-wrap: anywhere;
}
.user-bubble {
  background: #27231f;
  color: #fff8ec;
  border-bottom-right-radius: 7px;
  box-shadow: 0 10px 30px rgba(35, 28, 19, .12);
}
.assistant-card {
  width: min(100%, 820px);
  padding: 18px 20px;
  border: 1px solid var(--line);
  border-radius: 16px;
  border-bottom-left-radius: 7px;
  background: rgba(255, 253, 248, 0.9);
  box-shadow: 0 16px 46px rgba(63, 44, 21, 0.08);
}
.markdown-body { overflow-wrap: anywhere; }
.markdown-body > :first-child { margin-top: 0; }
.markdown-body > :last-child { margin-bottom: 0; }
.markdown-body p, .markdown-body ul, .markdown-body ol, .markdown-body blockquote, .markdown-body pre, .markdown-body .table-wrap { margin: 0 0 14px; }
.markdown-body h1, .markdown-body h2, .markdown-body h3 { margin: 18px 0 8px; line-height: 1.2; letter-spacing: 0; }
.markdown-body h1 { font-size: 23px; }
.markdown-body h2 { font-size: 19px; }
.markdown-body h3 { font-size: 16px; }
.markdown-body ul, .markdown-body ol { padding-left: 22px; }
.markdown-body li + li { margin-top: 5px; }
.markdown-body a { color: var(--accent-dark); text-decoration: underline; text-underline-offset: 2px; }
.markdown-body code {
  padding: 2px 6px;
  border-radius: 6px;
  background: rgba(32, 29, 24, 0.08);
  font-family: var(--font-mono);
  font-size: 13px;
}
.markdown-body pre {
  overflow: auto;
  padding: 14px;
  border-radius: 12px;
  background: var(--code-bg);
  color: var(--code-text);
}
.markdown-body pre code { padding: 0; background: transparent; color: inherit; white-space: pre; }
.markdown-body blockquote {
  padding: 2px 0 2px 14px;
  border-left: 3px solid rgba(193, 95, 60, 0.38);
  color: var(--muted);
}
.table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; }
table { width: 100%; min-width: 520px; border-collapse: collapse; font-size: 14px; }
th, td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
th { background: var(--paper-2); font-weight: 650; }
tr:last-child td { border-bottom: 0; }
.context-grid { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; max-width: min(78%, 720px); }
.turn-assistant .context-grid { max-width: 100%; }
.context-card {
  display: flex; align-items: center; gap: 10px; min-width: 220px; max-width: 100%;
  padding: 9px 10px; border: 1px solid var(--line); border-radius: 12px;
  background: rgba(255, 253, 248, .72);
}
.context-icon { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 8px; background: rgba(193,95,60,.1); color: var(--accent-dark); }
.context-main { min-width: 0; }
.context-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 650; font-size: 13px; }
.context-subtitle { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 12px; }
.attachments { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin: 8px 0; }
.image-thumb { width: 92px; height: 92px; margin: 0; border: 1px solid var(--line); border-radius: 14px; overflow: hidden; background: var(--paper); }
.image-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.tool-group {
  margin: 0 0 16px;
  border: 1px solid rgba(193, 95, 60, 0.2);
  border-radius: 14px;
  background: rgba(255, 249, 240, 0.72);
  overflow: hidden;
}
.markdown-body + .tool-group { margin-top: 14px; }
.tool-group summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
  padding: 10px 13px;
  color: var(--accent-dark);
  font-size: 13px;
  font-weight: 700;
  list-style: none;
}
.tool-group summary::-webkit-details-marker { display: none; }
.tool-chevron { font-size: 19px; line-height: 1; color: rgba(125, 50, 31, .58); transition: transform .16s ease; }
.tool-group[open] .tool-chevron { transform: rotate(90deg); }
.tool-list { border-top: 1px solid rgba(193, 95, 60, 0.14); padding: 6px 0; }
.tool-row {
  position: relative;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 9px;
  padding: 8px 13px;
  font-size: 13px;
}
.tool-row::before {
  content: "";
  position: absolute;
  left: 21px;
  top: 20px;
  bottom: -8px;
  width: 1px;
  background: rgba(125, 50, 31, .18);
}
.tool-row:last-child::before { display: none; }
.tool-dot {
  position: relative;
  z-index: 1;
  width: 9px;
  height: 9px;
  margin-top: 7px;
  border-radius: 999px;
  background: rgba(32, 29, 24, .34);
  box-shadow: 0 0 0 4px rgba(255, 249, 240, .95);
}
.tool-dot-thinking { background: #9b8e80; }
.tool-dot-started { background: #9b8e80; }
.tool-dot-completed { background: #67b776; }
.tool-dot-failed { background: #c83e32; }
.tool-copy { min-width: 0; }
.tool-title { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.tool-name { font-family: var(--font-mono); font-weight: 650; }
.tool-summary { min-width: 0; color: var(--muted); overflow-wrap: anywhere; }
.tool-summary a { color: #2f6fd6; text-decoration: underline; text-underline-offset: 2px; }
.tool-result { margin-top: 2px; color: rgba(32, 29, 24, .72); font-family: var(--font-mono); font-size: 12px; }
.tool-status { color: var(--muted); white-space: nowrap; font-size: 12px; }
.tool-status-thinking { color: #8d8175; }
.tool-status-completed { color: #3a8a4a; }
.tool-status-failed { color: #b3261e; }
.time { display: block; margin-top: 8px; color: var(--muted); font-size: 12px; }
@media (max-width: 720px) {
  .shell { padding: 18px 12px 48px; }
  .hero { grid-template-columns: 1fr; padding: 20px; }
  .brand-mark { display: none; }
  .bubble, .context-grid { max-width: 92%; }
  .assistant-card { padding: 15px; }
  .tool-row { grid-template-columns: 18px minmax(0, 1fr); }
}
"""


def main() -> None:
    parser = argparse.ArgumentParser(description="渲染 Claude Code 聊天分享 HTML")
    parser.add_argument("--input", help="Claude Code JSONL 或 transcript JSON 路径")
    parser.add_argument("--current", action="store_true", help="自动选择最新 Claude Code 会话")
    parser.add_argument("--output", help="输出 HTML 路径")
    parser.add_argument("--print-project-name", action="store_true", help="输出 PreviewShip 项目名")
    parser.add_argument("--list-recent", action="store_true", help="列出最近 Claude Code 会话")
    args = parser.parse_args()

    if args.list_recent:
        print_recent_sessions()
        return

    if args.current:
        input_path = find_current_session()
        print(f"# 当前 Claude Code 会话: {input_path}", file=sys.stderr)
    elif args.input:
        input_path = Path(args.input).expanduser()
    else:
        parser.error("需要 --input <路径> 或 --current")

    data = load_transcript_data(input_path)
    if args.print_project_name:
        print(project_name_from_data(data))
        return

    if not args.output:
        parser.error("--output 是必需的，除非使用 --print-project-name")

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(render_html(data), encoding="utf-8")
    print(str(output_path))


if __name__ == "__main__":
    main()
