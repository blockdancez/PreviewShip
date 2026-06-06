#!/usr/bin/env python3
"""将 Codex 对话 JSON 渲染为自包含 HTML。"""

from __future__ import annotations

import argparse
import base64
import html
import io
import json
import mimetypes
import re
import sqlite3
import subprocess
import sys
import unicodedata
from pathlib import Path
from typing import Any


CODE_BLOCK_RE = re.compile(r"```([^\n`]*)\n(.*?)```", re.DOTALL)
SENSITIVE_TEXT_RE = re.compile(r"\bps_live_[A-Za-z0-9_.-]*")
DATA_IMAGE_RE = re.compile(r"^data:(image/[a-zA-Z0-9.+-]+);base64,(.+)$", re.DOTALL)
THUMBNAIL_MAX_SIZE = (220, 220)
HIDDEN_PREFIXES = (
    "# AGENTS.md instructions",
    "AGENTS.md instructions",
    "<environment_context>",
    "<skill>",
)
TITLE_SLUG_OVERRIDES = {
    "创建聊天记录分享技能": "create-chat-record-sharing-skill",
    "分享当前 Codex 对话": "share-current-codex-chat",
}


def escape_text(value: Any) -> str:
    return html.escape(redact_sensitive_text(str(value)), quote=True)


def redact_sensitive_text(value: str) -> str:
    return SENSITIVE_TEXT_RE.sub("PREVIEWSHIP_API_KEY_REDACTED", value)


def is_hidden_context_message(content: str) -> bool:
    stripped = content.strip()
    if any(stripped.startswith(prefix) for prefix in HIDDEN_PREFIXES):
        return True
    if stripped.startswith("<skill>\n<name>") and stripped.endswith("</skill>"):
        return True
    return False


def is_duration(value: str) -> bool:
    if not value:
        return False
    return bool(re.fullmatch(r"\d+\s*(?:ms|s|m|h)(?:\s+\d+\s*(?:ms|s|m|h))*", value.strip()))


def is_progress_message(content: str) -> bool:
    stripped = content.strip()
    if not stripped:
        return False
    progress_prefixes = (
        "我会使用",
        "我会用",
        "我先",
        "现在我",
        "接下来我",
        "我已经",
        "文件已经",
        "验证通过",
        "回归测试",
        "当前环境",
        "Playwright",
    )
    if stripped.startswith(progress_prefixes):
        return True
    return "现在我" in stripped[:80] and ("检查" in stripped[:120] or "部署" in stripped[:120])


def slugify(value: str, fallback: str = "codex-chat-share") -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", normalized).strip("-").lower()
    slug = re.sub(r"-{2,}", "-", slug)
    return slug[:64].strip("-") or fallback


def project_name_from_data(data: dict[str, Any]) -> str:
    for key in ("projectName", "project_name"):
        value = str(data.get(key) or "").strip()
        if value:
            return slugify(value)
    for key in ("titleEn", "title_en"):
        value = str(data.get(key) or "").strip()
        if value:
            slug = slugify(value, fallback="")
            if slug:
                return slug
    title = str(data.get("title") or "").strip()
    if title in TITLE_SLUG_OVERRIDES:
        return TITLE_SLUG_OVERRIDES[title]
    return slugify(title)


def load_transcript_data(input_path: Path) -> dict[str, Any]:
    raw = input_path.read_text(encoding="utf-8")
    stripped = raw.lstrip()
    if stripped.startswith("{"):
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return codex_jsonl_to_data(raw, input_path)
        if not isinstance(data, dict):
            raise ValueError("transcript JSON 必须是对象")
        return data
    if stripped.startswith("["):
        messages = json.loads(raw)
        if not isinstance(messages, list):
            raise ValueError("transcript JSON 数组必须包含消息对象")
        return {"title": "Codex Chat Share", "messages": messages}
    return codex_jsonl_to_data(raw, input_path)


def codex_jsonl_to_data(raw: str, input_path: Path) -> dict[str, Any]:
    records: list[dict[str, Any]] = []
    for line_no, line in enumerate(raw.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"第 {line_no} 行不是合法 JSONL") from exc
        if isinstance(record, dict):
            records.append(record)

    has_visible_events = any(
        record.get("type") == "event_msg"
        and isinstance(record.get("payload"), dict)
        and record["payload"].get("type") in {"user_message", "agent_message", "task_complete"}
        for record in records
    )
    messages: list[dict[str, Any]] = []
    pending_details: list[str] = []
    pending_duration = ""
    pending_artifacts: list[dict[str, str]] = []
    pending_changes: list[dict[str, Any]] = []

    def flush_orphan_details() -> None:
        nonlocal pending_details, pending_duration, pending_artifacts, pending_changes
        if pending_details or pending_artifacts or pending_changes:
            messages.append(
                {
                    "role": "assistant",
                    "content": "",
                    "duration": pending_duration,
                    "details": pending_details,
                    "artifacts": pending_artifacts,
                    "changes": pending_changes,
                }
            )
            pending_details = []
            pending_duration = ""
            pending_artifacts = []
            pending_changes = []

    for record in records:
        payload = record.get("payload")
        if not isinstance(payload, dict):
            continue
        if record.get("type") == "event_msg":
            event_type = str(payload.get("type") or "")
            if event_type == "user_message":
                flush_orphan_details()
                messages.append(
                    {
                        "role": "user",
                        "content": str(payload.get("message") or "").strip(),
                        "attachments": [
                            *attachments_from_sources(payload.get("images"), "聊天图片"),
                            *attachments_from_sources(payload.get("local_images"), "聊天图片"),
                            *attachments_from_text_elements(payload.get("text_elements")),
                        ],
                    }
                )
                continue
            if event_type == "agent_message":
                text = str(payload.get("message") or "").strip()
                if not text:
                    continue
                if str(payload.get("phase") or "") == "final_answer":
                    messages.append(
                        {
                            "role": "assistant",
                            "content": text,
                            "duration": pending_duration,
                            "details": pending_details,
                            "artifacts": artifacts_for_message(text, pending_changes, pending_artifacts),
                            "changes": pending_changes,
                        }
                    )
                    pending_details = []
                    pending_duration = ""
                    pending_artifacts = []
                    pending_changes = []
                else:
                    pending_details.append(text)
                continue
            if event_type == "patch_apply_end":
                artifacts, changes = patch_event_to_cards(payload)
                pending_artifacts = merge_artifacts(pending_artifacts, artifacts)
                pending_changes = merge_changes(pending_changes, changes)
                continue
            if event_type == "task_complete":
                pending_duration = format_duration_ms(payload.get("duration_ms"))
                last_text = str(payload.get("last_agent_message") or "").strip()
                if messages and messages[-1].get("role") == "assistant":
                    if not messages[-1].get("content") and last_text:
                        messages[-1]["content"] = last_text
                    if pending_duration:
                        messages[-1]["duration"] = pending_duration
                    if pending_artifacts:
                        messages[-1]["artifacts"] = merge_artifacts(messages[-1].get("artifacts", []), pending_artifacts)
                    if pending_changes:
                        messages[-1]["changes"] = merge_changes(messages[-1].get("changes", []), pending_changes)
                    pending_duration = ""
                    pending_artifacts = []
                    pending_changes = []
                elif last_text:
                    messages.append(
                        {
                            "role": "assistant",
                            "content": last_text,
                            "duration": pending_duration,
                            "details": pending_details,
                            "artifacts": artifacts_for_message(last_text, pending_changes, pending_artifacts),
                            "changes": pending_changes,
                        }
                    )
                    pending_details = []
                    pending_duration = ""
                    pending_artifacts = []
                    pending_changes = []
                continue
        if not has_visible_events and record.get("type") == "response_item" and payload.get("type") == "message":
            # Fallback for exported records that do not include event_msg lines.
            role = str(payload.get("role") or "").strip().lower()
            if role in {"user", "assistant"}:
                content, attachments = content_from_response_message(payload)
                if content or attachments:
                    messages.append({"role": role, "content": content, "attachments": attachments})

    flush_orphan_details()
    if not messages:
        raise ValueError("JSONL 中没有可渲染的 Codex 消息")
    return {
        "title": title_from_session_index(input_path) or "Codex Chat Share",
        "titleEn": title_from_session_index(input_path) or "Codex Chat Share",
        "messages": messages,
    }


def title_from_session_index(input_path: Path) -> str:
    index_path = input_path.parents[4] / "session_index.jsonl" if len(input_path.parents) >= 5 else Path()
    if not index_path.exists():
        return ""
    try:
        for line in index_path.read_text(encoding="utf-8").splitlines():
            item = json.loads(line)
            if str(item.get("id") or "") in str(input_path):
                return str(item.get("thread_name") or "").strip()
    except Exception:
        return ""
    return ""


def format_duration_ms(value: Any) -> str:
    try:
        total_seconds = max(0, int(round(float(value) / 1000)))
    except (TypeError, ValueError):
        return ""
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    parts: list[str] = []
    if hours:
        parts.append(f"{hours}h")
    if minutes:
        parts.append(f"{minutes}m")
    if seconds or not parts:
        parts.append(f"{seconds}s")
    return " ".join(parts)


def attachments_from_sources(value: Any, alt: str) -> list[dict[str, str]]:
    if not value:
        return []
    values = value if isinstance(value, list) else [value]
    attachments: list[dict[str, str]] = []
    for index, item in enumerate(values, start=1):
        if isinstance(item, str):
            attachments.append({"src": item, "alt": f"{alt} {index}"})
            continue
        if isinstance(item, dict):
            src = item.get("src") or item.get("url") or item.get("path") or item.get("image_url")
            if isinstance(src, dict):
                src = src.get("url")
            attachments.append({"src": str(src or ""), "alt": str(item.get("alt") or item.get("name") or f"{alt} {index}")})
    return attachments


def attachments_from_text_elements(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    attachments: list[dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        item_type = str(item.get("type") or item.get("kind") or "").lower()
        if item_type not in {"image", "local_image", "image_url", "input_image"}:
            continue
        src = item.get("src") or item.get("path") or item.get("url") or item.get("image_url")
        if isinstance(src, dict):
            src = src.get("url")
        attachments.append({"src": str(src or ""), "alt": str(item.get("alt") or item.get("name") or "聊天图片")})
    return attachments


def content_from_response_message(payload: dict[str, Any]) -> tuple[str, list[dict[str, str]]]:
    parts: list[str] = []
    attachments: list[dict[str, str]] = []
    content = payload.get("content")
    if not isinstance(content, list):
        return "", []
    for item in content:
        if not isinstance(item, dict):
            continue
        item_type = str(item.get("type") or "").lower()
        if item_type in {"input_text", "output_text", "text"}:
            text = str(item.get("text") or "").strip()
            if text:
                parts.append(text)
        elif item_type in {"input_image", "image", "image_url", "local_image"}:
            src = item.get("image_url") or item.get("url") or item.get("path") or item.get("src")
            if isinstance(src, dict):
                src = src.get("url")
            attachments.append({"src": str(src or ""), "alt": "聊天图片"})
    return "\n\n".join(parts), attachments


def patch_event_to_cards(payload: dict[str, Any]) -> tuple[list[dict[str, str]], list[dict[str, Any]]]:
    if not payload.get("success", True):
        return [], []
    raw_changes = payload.get("changes")
    if not isinstance(raw_changes, dict):
        return [], []
    artifacts: list[dict[str, str]] = []
    changes: list[dict[str, Any]] = []
    for path, raw_change in raw_changes.items():
        if not isinstance(raw_change, dict):
            continue
        display_path = str(raw_change.get("move_path") or path)
        added, deleted = change_line_counts(raw_change)
        changes.append({"path": display_path, "added": added, "deleted": deleted})
        artifact = artifact_for_path(display_path)
        if artifact:
            artifacts.append(artifact)
    return merge_artifacts([], artifacts), changes


def change_line_counts(change: dict[str, Any]) -> tuple[int, int]:
    change_type = str(change.get("type") or "").lower()
    if change_type == "add":
        return count_text_lines(str(change.get("content") or "")), 0
    if change_type == "delete":
        return 0, count_text_lines(str(change.get("content") or change.get("before") or ""))
    diff = str(change.get("unified_diff") or change.get("diff") or change.get("patch") or "")
    if diff:
        added = 0
        deleted = 0
        for line in diff.splitlines():
            if line.startswith("+++") or line.startswith("---"):
                continue
            if line.startswith("+"):
                added += 1
            elif line.startswith("-"):
                deleted += 1
        return added, deleted
    before = str(change.get("before") or "")
    after = str(change.get("after") or "")
    if before or after:
        return max(0, count_text_lines(after) - common_line_floor(before, after)), max(
            0, count_text_lines(before) - common_line_floor(before, after)
        )
    return 0, 0


def common_line_floor(before: str, after: str) -> int:
    return min(count_text_lines(before), count_text_lines(after))


def count_text_lines(value: str) -> int:
    if not value:
        return 0
    return len(value.rstrip("\n").splitlines())


def artifact_for_path(path: str) -> dict[str, str] | None:
    name = Path(path).name
    suffix = Path(path).suffix.lower().lstrip(".")
    if not name or suffix not in {"md", "markdown", "txt", "json", "yaml", "yml"}:
        return None
    type_label = suffix.upper() if suffix else "文档"
    return {"title": name, "subtitle": f"文档 · {type_label}", "icon": "◇", "path": path}


def artifacts_for_message(
    content: str,
    changes: list[dict[str, Any]],
    pending_artifacts: list[dict[str, str]],
) -> list[dict[str, str]]:
    artifacts = merge_artifacts([], pending_artifacts)
    for match in re.finditer(r"\[[^\]]+\]\((/[^)\s]+)\)", content):
        artifact = artifact_for_path(match.group(1))
        if artifact:
            artifacts = merge_artifacts(artifacts, [artifact])
    if not artifacts:
        for change in changes:
            artifact = artifact_for_path(str(change.get("path") or ""))
            if artifact:
                artifacts = merge_artifacts(artifacts, [artifact])
                break
    return artifacts


def merge_artifacts(existing: list[Any], new_items: list[Any]) -> list[dict[str, str]]:
    merged: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for item in [*existing, *new_items]:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or item.get("name") or "").strip()
        path = str(item.get("path") or "").strip()
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
                "subtitle": str(item.get("subtitle") or item.get("type") or "文档").strip(),
                "icon": str(item.get("icon") or "◇"),
                "path": path,
            }
        )
    return merged


def merge_changes(existing: list[Any], new_items: list[Any]) -> list[dict[str, Any]]:
    by_path: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    for item in [*existing, *new_items]:
        if not isinstance(item, dict):
            continue
        path = str(item.get("path") or "").strip()
        if not path:
            continue
        if path not in by_path:
            order.append(path)
            by_path[path] = {"path": path, "added": 0, "deleted": 0}
        by_path[path]["added"] += int(item.get("added") or 0)
        by_path[path]["deleted"] += int(item.get("deleted") or 0)
    return [by_path[path] for path in order]


def format_skill_label(label: str) -> str:
    cleaned = label.strip().lstrip("$")
    if re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)+", cleaned):
        return " ".join(part.capitalize() for part in cleaned.split("-"))
    return cleaned


def format_mention_label(label: str, target: str = "") -> str:
    cleaned = label.strip().lstrip("@$")
    if not cleaned and target:
        cleaned = target.rsplit("/", 1)[-1].split("@", 1)[0]
    if cleaned.lower() == "chrome":
        return "Chrome"
    if re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)+", cleaned):
        return " ".join(part.capitalize() for part in cleaned.split("-"))
    return cleaned or "Mention"


def render_inline(text: str) -> str:
    escaped = escape_text(text)
    code_tokens: list[str] = []

    def keep_inline_code(match: re.Match[str]) -> str:
        idx = len(code_tokens)
        code_tokens.append(f"<code>{match.group(1)}</code>")
        return f"@@INLINE_CODE_{idx}@@"

    escaped = re.sub(r"`([^`]+)`", keep_inline_code, escaped)
    escaped = re.sub(
        r"\[([^\]]+)\]\((plugin://[^)\s]+)\)",
        lambda m: render_mention_chip(m.group(1), m.group(2), "plugin"),
        escaped,
    )
    escaped = re.sub(
        r"(?<!\[)@([a-zA-Z0-9_-]+)\]\((plugin://[^)\s]+)\)",
        lambda m: render_mention_chip(m.group(1), m.group(2), "plugin"),
        escaped,
    )
    escaped = re.sub(
        r"\[([^\]]+)\]\((app://[^)\s]+)\)",
        lambda m: render_mention_chip(m.group(1), m.group(2), "app"),
        escaped,
    )
    escaped = re.sub(
        r"\[([^\]]+)\]\((https?://[^)\s]+)\)",
        lambda m: f'<a href="{m.group(2)}" target="_blank" rel="noreferrer">{m.group(1)}</a>',
        escaped,
    )
    escaped = re.sub(
        r"\[([^\]]+)\]\((/[^)\s]+SKILL\.md)\)",
        lambda m: render_skill_chip(m.group(1)),
        escaped,
    )
    escaped = re.sub(
        r"\[([^\]]+)\]\((/[^)\s]+)\)",
        lambda m: f'<a href="#">{m.group(1)}</a>',
        escaped,
    )
    escaped = re.sub(r"\*\*([^*\n][^*]*?)\*\*", lambda m: f"<strong>{m.group(1)}</strong>", escaped)
    escaped = re.sub(r"__([^_\n][^_]*?)__", lambda m: f"<strong>{m.group(1)}</strong>", escaped)
    escaped = re.sub(r"(?<!\*)\*([^*\n][^*]*?)\*(?!\*)", lambda m: f"<em>{m.group(1)}</em>", escaped)
    for idx, token in enumerate(code_tokens):
        escaped = escaped.replace(f"@@INLINE_CODE_{idx}@@", token)
    return escaped


def render_skill_chip(label: str) -> str:
    text = escape_text(format_skill_label(html.unescape(label)))
    return f"""
      <span class="skill-link">
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3.5 18 6.8v6.6L12 16.7 6 13.4V6.8L12 3.5Z"></path>
          <path d="M6.5 7 12 10.1 17.5 7"></path>
          <path d="M12 10.1v6.1"></path>
        </svg>{text}
      </span>"""


def render_mention_chip(label: str, target: str, kind: str) -> str:
    text = escape_text(format_mention_label(label, target))
    icon = "◎" if kind == "plugin" else "◇"
    if text == "Chrome":
        icon = '<span class="chrome-dot" aria-hidden="true"></span>'
    else:
        icon = f'<span class="mention-icon" aria-hidden="true">{icon}</span>'
    return f'<span class="mention-chip mention-{kind}" title="{escape_text(target)}">{icon}{text}</span>'


def extract_markdown_images(markdown: str) -> tuple[str, list[dict[str, str]]]:
    attachments: list[dict[str, str]] = []

    def keep_image(match: re.Match[str]) -> str:
        attachments.append({"src": match.group(2), "alt": match.group(1) or "聊天图片"})
        return ""

    cleaned = re.sub(r"!\[([^\]]*)\]\(([^)\s]+)\)", keep_image, markdown)
    return cleaned.strip(), attachments


def normalize_content_and_attachments(message: dict[str, Any]) -> tuple[str, list[Any]]:
    attachments = list(message.get("attachments") if isinstance(message.get("attachments"), list) else [])
    raw = message.get("content", message.get("items", ""))
    if isinstance(raw, list):
        parts: list[str] = []
        for item in raw:
            if not isinstance(item, dict):
                parts.append(str(item))
                continue
            item_type = str(item.get("type") or item.get("kind") or "").lower()
            text = str(item.get("text") or item.get("content") or "").strip()
            if item_type in {"text", "markdown", "input_text", "output_text"}:
                if text:
                    parts.append(text)
                continue
            if item_type in {"image", "local_image", "image_url", "input_image"}:
                src = item.get("src") or item.get("path") or item.get("url") or item.get("image_url")
                if isinstance(src, dict):
                    src = src.get("url")
                attachments.append({"src": str(src or ""), "alt": str(item.get("alt") or item.get("name") or "聊天图片")})
                continue
            if item_type in {"skill", "mention", "plugin", "app"}:
                label = item.get("name") or item.get("label") or item.get("text") or item.get("id") or "Mention"
                target = item.get("path") or item.get("url") or item.get("target") or item.get("uri") or ""
                if target:
                    parts.append(f"[{label}]({target})")
                else:
                    parts.append(str(label))
                continue
            if text:
                parts.append(text)
        content = "\n\n".join(part for part in parts if part.strip())
    else:
        content = str(raw or "").strip()

    content, markdown_attachments = extract_markdown_images(content)
    attachments.extend(markdown_attachments)
    if not attachments:
        attachments.extend(infer_missing_attachments(content))
    return content, attachments


def infer_missing_attachments(content: str) -> list[dict[str, str]]:
    if "上传" not in content or ("截图" not in content and "图片" not in content):
        return []
    count = 1
    for word, value in {"两张": 2, "2张": 2, "三张": 3, "3张": 3}.items():
        if word in content:
            count = value
            break
    return [{"alt": f"用户上传图片 {idx + 1}", "missing": True} for idx in range(count)]


_MD_CACHE: dict[str, str] = {}
_MD_SCRIPT = str(Path(__file__).resolve().parent / "md.mjs")


def _render_md_batch(originals: list[str]) -> None:
    """用 Codex 同款 marked(node) 批量渲染 markdown，结果写入 _MD_CACHE。"""
    pending = [m for m in dict.fromkeys(originals) if m not in _MD_CACHE]
    if not pending:
        return
    payload = json.dumps({"items": [redact_sensitive_text(m) for m in pending]})
    htmls: list[str] = []
    try:
        proc = subprocess.run(
            ["node", _MD_SCRIPT],
            input=payload, capture_output=True, text=True, timeout=60,
        )
        htmls = (json.loads(proc.stdout) or {}).get("html") or []
    except Exception:
        htmls = []
    for i, m in enumerate(pending):
        _MD_CACHE[m] = htmls[i] if i < len(htmls) else ("<p>" + escape_text(m) + "</p>")


def prime_markdown(messages: list[dict[str, Any]]) -> None:
    """渲染前一次性批量预渲染所有 markdown 片段，避免逐段启动 node。"""
    bucket: list[str] = []
    for msg in messages:
        c = str(msg.get("content") or "")
        if c.strip():
            bucket.append(c)
        for item in (msg.get("details") or []):
            if str(item).strip():
                bucket.append(str(item))
    _render_md_batch(bucket)


def render_markdown(markdown: str) -> str:
    md = markdown if isinstance(markdown, str) else str(markdown or "")
    if not md.strip():
        return ""
    if md not in _MD_CACHE:
        _render_md_batch([md])
    return _MD_CACHE.get(md, "<p>" + escape_text(md) + "</p>")


def normalize_messages(data: dict[str, Any]) -> list[dict[str, Any]]:
    messages = data.get("messages")
    if not isinstance(messages, list):
        raise ValueError("transcript.json 必须包含 messages 数组")

    normalized: list[dict[str, Any]] = []
    for index, message in enumerate(messages, start=1):
        if not isinstance(message, dict):
            raise ValueError(f"第 {index} 条消息必须是对象")
        role = str(message.get("role", "")).strip().lower()
        content, attachments = normalize_content_and_attachments(message)
        if message.get("visible") is False or is_hidden_context_message(content):
            continue
        if role not in {"user", "assistant"}:
            continue
        details = normalize_details(message)
        artifacts = message.get("artifacts") if isinstance(message.get("artifacts"), list) else []
        changes = message.get("changes") if isinstance(message.get("changes"), list) else []
        if not (content or attachments or details or artifacts or changes or message.get("duration") or message.get("timestamp")):
            continue
        normalized.append(
            {
                "role": role,
                "content": content,
                "duration": str(message.get("duration", "")).strip(),
                "timestamp": str(message.get("timestamp", "")).strip(),
                "attachments": attachments,
                "details": details,
                "artifacts": artifacts,
                "changes": changes,
            }
        )
    if not normalized:
        raise ValueError("没有可渲染的消息")
    return compact_assistant_progress(normalized)


def normalize_details(message: dict[str, Any]) -> list[str]:
    raw = (
        message.get("details")
        or message.get("workLog")
        or message.get("workLogs")
        or message.get("work_log")
        or message.get("processing")
        or message.get("processingDetails")
        or []
    )
    if isinstance(raw, str):
        return [raw.strip()] if raw.strip() else []
    if isinstance(raw, list):
        return [str(item).strip() for item in raw if str(item).strip()]
    return []


def has_structural_ui(message: dict[str, Any]) -> bool:
    return bool(
        is_duration(str(message.get("duration") or ""))
        or message.get("timestamp")
        or message.get("attachments")
        or message.get("details")
        or message.get("artifacts")
        or message.get("changes")
    )


def compact_assistant_progress(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    compacted: list[dict[str, Any]] = []
    pending_details: list[str] = []
    for index, message in enumerate(messages):
        next_message = messages[index + 1] if index + 1 < len(messages) else None
        if (
            message["role"] == "assistant"
            and next_message
            and next_message["role"] == "assistant"
            and (not has_structural_ui(message) or is_progress_message(message["content"]))
        ):
            pending_details.append(message["content"])
            continue
        if (
            message["role"] == "assistant"
            and next_message
            and next_message["role"] == "assistant"
            and message.get("duration")
            and not is_duration(str(message.get("duration") or ""))
        ):
            pending_details.append(message["content"])
            continue
        if message["role"] == "assistant" and pending_details:
            message["details"] = [*pending_details, *message.get("details", [])]
            pending_details = []
        elif message["role"] == "assistant" and is_progress_message(message["content"]) and not has_structural_ui(message):
            message["details"] = [message["content"], *message.get("details", [])]
            message["content"] = ""
            if not is_duration(str(message.get("duration") or "")):
                message["duration"] = ""
        elif message["role"] != "assistant":
            pending_details = []
        compacted.append(message)
    return compacted


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
    raw = path.read_bytes()
    return thumbnail_bytes_to_data_url(raw, mime), True


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
                alpha = image.getchannel("A")
                background.paste(image.convert("RGB"), mask=alpha)
                image = background
            else:
                image = image.convert("RGB")
            out = io.BytesIO()
            try:
                image.save(out, format="WEBP", quality=72, method=6)
                return f"data:image/webp;base64,{base64.b64encode(out.getvalue()).decode('ascii')}"
            except Exception:
                out = io.BytesIO()
                image.save(out, format="JPEG", quality=72, optimize=True)
                return f"data:image/jpeg;base64,{base64.b64encode(out.getvalue()).decode('ascii')}"
    except Exception:
        return fallback or f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"


def render_attachment(attachment: Any) -> str:
    if not isinstance(attachment, dict):
        return ""
    src = str(attachment.get("src") or attachment.get("url") or "").strip()
    alt = str(attachment.get("alt") or "聊天附件").strip()
    resolved_src, ok = resolve_image_src(src)
    if attachment.get("missing") or not ok:
        return f"""
          <figure class="attachment-thumb attachment-missing" title="{escape_text(alt)}">
            <span aria-hidden="true">▧</span>
            <figcaption>{escape_text(shorten_label(alt, 8))}</figcaption>
          </figure>"""
    return f"""
          <figure class="attachment-thumb">
            <img src="{escape_text(resolved_src)}" alt="{escape_text(alt)}" />
          </figure>"""


def shorten_label(label: str, max_len: int) -> str:
    return label if len(label) <= max_len else f"{label[:max_len]}…"


# —— Codex inline-mention(与 md.mjs 同一套):brand-aware 颜色由 codex-styles.css 经 class 自动给 ——
INLINE_MENTION_CLS = (
    "inline-mention-brand-aware font-medium text-[color:var(--inline-mention-color)] "
    "[--inline-mention-color:var(--inline-mention-resolved-base-color,var(--inline-mention-base-color))] "
    "[--inline-mention-base-color:color-mix(in_srgb,var(--color-token-text-link-foreground)_80%,var(--color-token-foreground)_20%)] "
    "group-hover/inline-mention:underline group-hover/inline-mention:decoration-dashed group-hover/inline-mention:underline-offset-2"
)
INLINE_LINK_CLS = "text-[color:var(--color-token-text-link-foreground)] hover:underline"
MENTION_ICON = {
    "skill": '<svg viewBox="0 0 16 16" fill="none" class="icon-xs absolute top-1/2 -translate-y-1/2"><path d="M8 1.8 13.5 5v6L8 14.2 2.5 11V5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"></path><path d="M2.6 5 8 8.1 13.4 5M8 8.1v6" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"></path></svg>',
    "file": '<svg viewBox="0 0 16 16" fill="none" class="icon-xs absolute top-1/2 -translate-y-1/2"><path d="M8.4 1.9H4.3a.8.8 0 0 0-.8.8v10.6a.8.8 0 0 0 .8.8h7.4a.8.8 0 0 0 .8-.8V5.9z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"></path><path d="M8.3 2v3.9h4" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"></path></svg>',
    "app": '<svg viewBox="0 0 16 16" fill="none" class="icon-xs absolute top-1/2 -translate-y-1/2"><path d="M6.4 9.6 9.6 6.4M6.6 4.6l1-1a2.7 2.7 0 0 1 3.8 3.8l-1 1M9.4 11.4l-1 1a2.7 2.7 0 0 1-3.8-3.8l1-1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"></path></svg>',
}


def inline_mention(label: str, kind: str) -> str:
    icon = MENTION_ICON.get(kind, MENTION_ICON["app"])
    if kind == "skill":
        text = format_skill_label(label)
    elif kind == "file":
        text = label.strip() or "file"
    else:
        text = format_mention_label(label)
    return (
        '<span class="group/inline-mention">'
        f'<span class="{INLINE_MENTION_CLS} px-0.5">'
        f'<span class="relative mr-[3px] inline-block h-[1lh] w-4 align-bottom">{icon}</span>'
        f'<span class="min-w-0 break-words">{escape_text(text)}</span>'
        "</span></span>"
    )


def render_user_text(content: str) -> str:
    """用户消息:保留 whitespace-pre-wrap 纯文本,但把 [label](target) 提及/文件/外链解析成 Codex inline-mention。"""
    esc = escape_text(content)

    def repl(m: "re.Match[str]") -> str:
        label = html.unescape(m.group(1))
        target = html.unescape(m.group(2))
        if target.endswith("SKILL.md"):
            return inline_mention(label, "skill")
        if target.startswith(("plugin://", "app://")):
            return inline_mention(label, "app")
        if target.startswith(("http://", "https://")):
            return f'<a class="{INLINE_LINK_CLS}" href="{escape_text(target)}" target="_blank" rel="noreferrer">{escape_text(label)}</a>'
        if target.startswith("/") or target.startswith("~") or target.startswith("./"):
            return inline_mention(label, "file")
        return m.group(0)

    return re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", repl, esc)


def render_user_message(message: dict[str, Any]) -> str:
    # Codex 用户消息:右对齐灰色圆角气泡,正文是 whitespace-pre-wrap 纯文本(不走 markdown)
    attachments = "".join(render_attachment(item) for item in message.get("attachments", []))
    attachment_block = (
        f'<div class="my-2 flex flex-wrap items-end justify-end gap-2">{attachments}</div>' if attachments else ""
    )
    raw = str(message.get("content") or "")
    text = render_user_text(raw)
    bubble = (
        f"""
          <div class="group flex w-full flex-col items-end justify-end gap-1">
            <div class="bg-token-foreground/5 max-w-[77%] min-w-0 overflow-hidden break-words rounded-2xl px-3 py-2 text-left" aria-label="用户消息">
              <div class="text-size-chat relative w-full min-w-0">
                <div class="text-size-chat whitespace-pre-wrap">{text}</div>
              </div>
            </div>
          </div>"""
        if raw.strip()
        else ""
    )
    return f"""
      <div class="flex flex-col items-end gap-2">
        {attachment_block}
        {bubble}
      </div>"""


def render_artifact_card(artifact: Any) -> str:
    if not isinstance(artifact, dict):
        return ""
    title = str(artifact.get("title") or artifact.get("name") or "Artifact")
    subtitle = str(artifact.get("subtitle") or artifact.get("type") or "文档")
    return f"""
          <section class="artifact-card">
            {render_card_icon("file")}
            <div>
              <div class="artifact-title">{escape_text(title)}</div>
              <div class="artifact-subtitle">{escape_text(subtitle)}</div>
            </div>
          </section>"""


def render_changes_card(changes: list[Any]) -> str:
    rows = []
    total_add = 0
    total_del = 0
    for change in changes:
        if not isinstance(change, dict):
            continue
        path = str(change.get("path") or "")
        added = int(change.get("added") or 0)
        deleted = int(change.get("deleted") or 0)
        total_add += added
        total_del += deleted
        rows.append(
            f"""
            <div class="changes-row">
              <div class="path">{escape_text(path)}</div>
              <div><span class="delta-plus">+{added}</span> <span class="delta-minus">-{deleted}</span></div>
            </div>"""
        )
    if not rows:
        return ""
    return f"""
          <section class="changes-card">
            <div class="changes-head">
              {render_card_icon("changes")}
              <div>
                <div class="changes-title">已编辑 {len(rows)} 个文件</div>
                <div class="changes-delta"><span class="delta-plus">+{total_add}</span> <span class="delta-minus">-{total_del}</span></div>
              </div>
              <div class="changes-actions" aria-hidden="true">
                <span class="undo-action"><svg class="undo-icon" viewBox="0 0 20 20" fill="none"><path d="M15.998 10.833C15.9978 8.439 14.0571 6.49805 11.663 6.49805H4.9355L7.13374 8.69629L7.2187 8.80078C7.38911 9.05884 7.36084 9.40947 7.13374 9.63672C6.90652 9.86394 6.55592 9.89207 6.2978 9.72168L6.19331 9.63672L2.85932 6.30371C2.5999 6.04411 2.60001 5.62295 2.85932 5.36328L6.19331 2.0293C6.45298 1.76998 6.87414 1.76987 7.13374 2.0293C7.39344 2.289 7.39344 2.711 7.13374 2.9707L4.93647 5.16797H11.663C14.7916 5.16797 17.3279 7.70446 17.3281 10.833C17.3281 13.9617 14.7917 16.498 11.663 16.498H8.33003C7.96276 16.498 7.66499 16.2003 7.66499 15.833C7.66516 15.4659 7.96287 15.168 8.33003 15.168H11.663C14.0572 15.168 15.998 13.2272 15.998 10.833Z" fill="currentColor"></path></svg>撤销</span>
                <span>审核</span>
              </div>
            </div>
            {''.join(rows)}
          </section>"""


def render_card_icon(kind: str) -> str:
    if kind == "changes":
        path = (
            '<rect x="6.5" y="4.5" width="11" height="15" rx="2.5"></rect>'
            '<path d="M9.5 9.5h5M12 7v5"></path>'
            '<path d="M9.5 15h5"></path>'
        )
    else:
        path = (
            '<path d="M12 3.5 18 6.8v6.6L12 16.7 6 13.4V6.8L12 3.5Z"></path>'
            '<path d="M6.5 7 12 10.1 17.5 7"></path>'
            '<path d="M12 10.1v6.1"></path>'
        )
    return f"""
            <div class="card-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{path}</svg>
            </div>"""


def render_assistant_message(message: dict[str, Any]) -> str:
    duration = message.get("duration") or ""
    details = message.get("details", [])
    status = render_processing_status(duration, details) if duration or details else ""
    artifacts = "".join(render_artifact_card(item) for item in message.get("artifacts", []))
    changes = render_changes_card(message.get("changes", []))
    action_bar = render_action_bar(message)
    body_content = render_markdown(message["content"]) if str(message.get("content") or "").strip() else ""
    inner = (
        f"""
        <div class="group flex min-w-0 flex-col">
          <div class="[&>*:first-child]:mt-0 _markdownContent_x0d1c_43 [&>*:last-child]:mb-0 [&>ol:first-child]:mt-0 [&>ul:first-child]:mt-0">
            {body_content}
          </div>
          {artifacts}
          {changes}
          {action_bar}
        </div>"""
        if body_content or artifacts or changes
        else ""
    )
    return f"""
      <div class="flex flex-col gap-2">
        {status}
        {inner}
      </div>"""


CHEVRON_SVG = (
    '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" class="icon-2xs text-token-foreground/40 transition-transform duration-200">'
    '<path d="M7.5 5 12.5 10 7.5 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>'
)


def render_processing_status(duration: str, details: list[str]) -> str:
    # Codex 的「已处理 <时长> ›」折叠行 + 其下的细分隔线
    label = f"已处理 {duration}" if is_duration(duration) else "已处理"
    head = f'<span><span class="text-token-foreground/60">{escape_text(label)}</span></span>{CHEVRON_SVG}'
    btn_cls = "text-size-chat hover:bg-token-bg-subtle inline-flex items-center gap-1 rounded-md border border-transparent"
    divider = '<div class="text-size-chat pt-1 text-token-text-secondary"><div class="w-full border-t border-token-border-light"></div></div>'
    if details:
        log = "".join(
            f'<div class="my-2 text-token-text-secondary">{render_markdown(item)}</div>' for item in details if item.strip()
        )
        inner = (
            f'<details><summary class="{btn_cls}" style="list-style:none;cursor:pointer">{head}</summary>'
            f'<div class="pt-1">{log}</div></details>'
        )
    else:
        inner = f'<button type="button" class="{btn_cls}" aria-expanded="false">{head}</button>'
    return f'<div class="flex flex-col"><div class="text-size-chat text-token-text-secondary">{inner}</div>{divider}</div>'


COPY_ICON = """<svg viewBox="0 0 21 21" fill="none"><path d="M13.468 11.1216C13.468 10.4107 13.468 9.91717 13.4367 9.53369C13.4137 9.25191 13.3758 9.0622 13.3244 8.91846L13.2687 8.78858C13.1148 8.48652 12.8803 8.23344 12.593 8.05713L12.466 7.98584C12.308 7.90546 12.0963 7.84854 11.7209 7.81787C11.3374 7.78656 10.8439 7.78662 10.133 7.78662H7.29999C6.58895 7.78662 6.09562 7.78654 5.7121 7.81787C5.43015 7.84091 5.24064 7.87872 5.09686 7.93018L4.96698 7.98584C4.66487 8.13977 4.41184 8.37419 4.23554 8.66162L4.16522 8.78858C4.08477 8.94657 4.02794 9.15811 3.99725 9.53369C3.96594 9.91718 3.96503 10.4107 3.96503 11.1216V13.9546C3.96503 14.6656 3.96592 15.159 3.99725 15.5425C4.02796 15.9182 4.08471 16.1296 4.16522 16.2876L4.23554 16.4136C4.41185 16.7012 4.66472 16.9353 4.96698 17.0894L5.09686 17.146C5.24061 17.1974 5.43024 17.2343 5.7121 17.2573C6.09562 17.2887 6.58895 17.2896 7.29999 17.2896H10.133C10.8439 17.2896 11.3374 17.2886 11.7209 17.2573C12.0965 17.2266 12.308 17.1698 12.466 17.0894L12.593 17.019C12.8804 16.8427 13.1148 16.5897 13.2687 16.2876L13.3244 16.1577C13.3759 16.0139 13.4137 15.8244 13.4367 15.5425C13.468 15.159 13.468 14.6656 13.468 13.9546V11.1216ZM14.798 13.1196C15.2528 13.118 15.6011 13.1147 15.8879 13.0913C16.2634 13.0606 16.475 13.0038 16.633 12.9233L16.759 12.8521C17.0466 12.6757 17.2808 12.4228 17.4348 12.1206L17.4914 11.9907C17.5428 11.847 17.5797 11.6572 17.6027 11.3755C17.634 10.992 17.6349 10.4985 17.6349 9.7876V6.95459C17.6349 6.24355 17.6341 5.75022 17.6027 5.3667C17.5797 5.08484 17.5428 4.89522 17.4914 4.75147L17.4348 4.62158C17.2807 4.31933 17.0466 4.06645 16.759 3.89014L16.633 3.81982C16.475 3.73932 16.2636 3.68256 15.8879 3.65186C15.5044 3.62052 15.011 3.61963 14.3 3.61963H11.467C10.7561 3.61963 10.2626 3.62054 9.87909 3.65186C9.59738 3.67487 9.40759 3.71179 9.26386 3.76318L9.13397 3.81982C8.83175 3.97382 8.57885 4.20802 8.40253 4.49561L8.33124 4.62158C8.25079 4.77957 8.19396 4.99114 8.16327 5.3667C8.13984 5.65352 8.13561 6.00178 8.13397 6.45654H10.133C10.822 6.45654 11.3791 6.4559 11.8293 6.49268C12.2873 6.5301 12.6937 6.6093 13.0705 6.80127L13.2883 6.92334C13.7839 7.22739 14.1878 7.66313 14.4533 8.18408L14.5197 8.32666C14.6642 8.66318 14.7291 9.02433 14.7619 9.42529C14.7987 9.8755 14.798 10.4326 14.798 11.1216V13.1196ZM18.965 9.7876C18.965 10.4766 18.9657 11.0337 18.9289 11.4839C18.8961 11.8848 18.8311 12.246 18.6867 12.5825L18.6203 12.7251C18.3548 13.246 17.9509 13.6818 17.4553 13.9858L17.2365 14.1079C16.8599 14.2998 16.4541 14.3791 15.9963 14.4165C15.6592 14.444 15.2624 14.4481 14.7951 14.4497C14.7935 14.917 14.7894 15.3138 14.7619 15.6509C14.7292 16.0516 14.664 16.4122 14.5197 16.7485L14.4533 16.8911C14.1878 17.4122 13.7841 17.8487 13.2883 18.1528L13.0705 18.2749C12.6937 18.4669 12.2873 18.5461 11.8293 18.5835C11.3791 18.6203 10.822 18.6196 10.133 18.6196H7.29999C6.6109 18.6196 6.05394 18.6203 5.6037 18.5835C5.20305 18.5508 4.84233 18.4855 4.50604 18.3413L4.36347 18.2749C3.84243 18.0094 3.40584 17.6056 3.10175 17.1099L2.97968 16.8911C2.78787 16.5145 2.70849 16.1087 2.67108 15.6509C2.6343 15.2006 2.63495 14.6437 2.63495 13.9546V11.1216C2.63495 10.4326 2.63431 9.8755 2.67108 9.42529C2.7085 8.96729 2.78771 8.56084 2.97968 8.18408L3.10175 7.96631C3.40585 7.47049 3.84235 7.06679 4.36347 6.80127L4.50604 6.73486C4.84236 6.59059 5.20302 6.52542 5.6037 6.49268C5.9405 6.46516 6.33707 6.4601 6.80389 6.4585C6.8055 5.99167 6.81056 5.5951 6.83807 5.2583C6.87549 4.80047 6.95482 4.39471 7.14667 4.01807L7.26874 3.79932C7.5728 3.30371 8.00855 2.89973 8.52948 2.63428L8.67206 2.56787C9.00854 2.42345 9.36978 2.35844 9.77069 2.32568C10.2209 2.28891 10.778 2.28955 11.467 2.28955H14.3C14.9891 2.28955 15.546 2.2889 15.9963 2.32568C16.4541 2.3631 16.8599 2.44247 17.2365 2.63428L17.4553 2.75635C17.951 3.06044 18.3548 3.49703 18.6203 4.01807L18.6867 4.16065C18.8309 4.49694 18.8962 4.85765 18.9289 5.2583C18.9657 5.70854 18.965 6.2655 18.965 6.95459V9.7876Z" fill="currentColor"></path></svg>"""
THUMB_ICON = """<svg viewBox="0 0 20 21" fill="none"><path d="M10.9153 2.11274L11.2942 2.16059L11.4749 2.18794C13.2633 2.51488 14.4107 4.29005 13.9749 6.05513L13.9261 6.23188L13.3987 7.94477C13.7708 7.94862 14.0961 7.95676 14.3792 7.97895C14.8737 8.01773 15.3109 8.10046 15.7015 8.3061L15.8528 8.39106C16.5966 8.8364 17.1278 9.56913 17.3167 10.4204L17.347 10.5825C17.403 10.9628 17.3647 11.3561 17.2835 11.7827C17.2375 12.0246 17.1735 12.2941 17.096 12.5961L16.8255 13.6049L16.4456 15.0004C16.2076 15.873 16.0438 16.5085 15.7366 17.0034L15.595 17.2075C15.2989 17.5908 14.9197 17.9009 14.4866 18.1137L14.2982 18.1987C13.6885 18.4502 12.9785 18.4379 11.9446 18.4379H7.33331C6.64422 18.4379 6.08726 18.4386 5.63702 18.4018C5.23638 18.3691 4.87565 18.3039 4.53936 18.1596L4.39679 18.0932C3.87576 17.8277 3.43916 17.4239 3.13507 16.9282L3.013 16.7094C2.82119 16.3328 2.74182 15.927 2.7044 15.4692C2.66762 15.019 2.66827 14.462 2.66827 13.7729V11.9399C2.66827 11.2077 2.66214 10.7104 2.77569 10.2866L2.83722 10.0854C3.17599 9.09055 3.99001 8.32371 5.01397 8.04927L5.17706 8.01216C5.56592 7.93723 6.02595 7.94087 6.66632 7.94087C6.9429 7.94087 7.19894 7.79325 7.33624 7.55317L10.2562 2.44282L10.3118 2.36079C10.4544 2.18027 10.6824 2.08379 10.9153 2.11274ZM7.33136 14.4399C7.33136 15.257 7.33714 15.5356 7.39386 15.7475L7.42999 15.8647C7.62644 16.4415 8.09802 16.8863 8.69171 17.0454L8.87042 17.0795C9.07652 17.1051 9.38687 17.1079 10.0003 17.1079H11.9446C13.099 17.1079 13.4838 17.0956 13.7903 16.9692L13.8997 16.9194C14.1508 16.796 14.3716 16.6172 14.5433 16.395L14.6155 16.2895C14.7769 16.0281 14.8968 15.6246 15.1624 14.6508L15.5433 13.2553L15.8079 12.2651C15.8804 11.9831 15.9368 11.744 15.9769 11.5336C16.0364 11.2209 16.0517 11.0104 16.0394 10.852L16.0179 10.7084C15.9156 10.2478 15.641 9.84669 15.2542 9.5854L15.0814 9.48286C14.9253 9.40072 14.6982 9.33832 14.2747 9.30513C13.8477 9.27168 13.2923 9.27095 12.5003 9.27095C12.2893 9.27095 12.0905 9.17109 11.9651 9.00141C11.8398 8.83166 11.8025 8.6123 11.8646 8.41059L12.6556 5.84028L12.7054 5.63618C12.8941 4.6324 12.216 3.65244 11.1878 3.49067L8.49054 8.21235C8.23033 8.66771 7.81431 9.00136 7.33136 9.16255V14.4399ZM3.99835 13.7729C3.99835 14.4839 3.99924 14.9773 4.03058 15.3608C4.06128 15.7365 4.11804 15.9479 4.19854 16.1059L4.26886 16.2319C4.44517 16.5195 4.69805 16.7537 5.0003 16.9077L5.13019 16.9633C5.27397 17.0148 5.46337 17.0526 5.74542 17.0756C5.97772 17.0946 6.25037 17.1009 6.58722 17.104C6.41249 16.8579 6.27075 16.5864 6.1712 16.2944L6.10968 16.0922C5.99614 15.6685 6.00128 15.1719 6.00128 14.4399V9.27583C5.79386 9.27957 5.65011 9.28627 5.53741 9.30024L5.3587 9.33345C4.76502 9.49252 4.29247 9.93735 4.09601 10.5141L4.06085 10.6313C4.00404 10.8433 3.99835 11.1221 3.99835 11.9399V13.7729Z" fill="currentColor"></path></svg>"""
FORK_ICON = """<svg fill="currentColor" viewBox="0 0 20 20"><path d="M15.8 11.535c.367 0 .665.298.665.665v5a.665.665 0 0 1-.665.665h-5a.665.665 0 1 1 0-1.33h3.394l-3.565-3.564a.666.666 0 0 1 .942-.942l3.564 3.565V12.2c0-.367.298-.665.665-.665Zm0-9.4c.367 0 .665.298.665.665v5a.665.665 0 0 1-1.33 0V4.405l-5.128 5.128c-.323.324-.558.565-.842.74a2.668 2.668 0 0 1-.771.319c-.324.078-.662.073-1.12.073H1.93a.665.665 0 1 1 0-1.33h5.345c.52 0 .673-.005.809-.037.136-.033.266-.086.385-.16.12-.072.23-.177.598-.545l5.128-5.128H10.8a.665.665 0 0 1 0-1.33h5Z"></path></svg>"""


ACTION_BTN_CLS = (
    "border-token-border user-select-none cursor-interaction flex items-center gap-1 border whitespace-nowrap "
    "rounded-full electron:rounded-md text-token-text-tertiary enabled:hover:bg-token-list-hover-background "
    "border-transparent electron:p-1 flex items-center justify-center p-0.5"
)


def _icon(svg: str, extra: str = "") -> str:
    return svg.replace("<svg ", f'<svg class="icon-xs {extra}" ', 1)


def render_action_bar(message: dict[str, Any]) -> str:
    # Codex 助手底部动作行:复制 / 喜欢 / 不喜欢(翻转) / 从此处开始分叉 + 可选时间戳
    timestamp = str(message.get("timestamp") or "").strip()
    timestamp_html = (
        f'<span class="ml-1.5 text-xs text-token-text-tertiary text-size-chat leading-5 text-token-input-placeholder-foreground">{escape_text(timestamp)}</span>'
        if timestamp
        else ""
    )

    def btn(svg: str, label: str, extra: str = "") -> str:
        return f'<button type="button" class="{ACTION_BTN_CLS}" aria-label="{label}">{_icon(svg, extra)}</button>'

    return f"""
          <div class="mt-1.5 flex h-5 items-center justify-start gap-0.5" aria-label="消息操作">
            {btn(COPY_ICON, "复制")}
            {btn(THUMB_ICON, "喜欢")}
            {btn(THUMB_ICON, "不喜欢", "rotate-180")}
            {btn(FORK_ICON, "从此处开始分叉")}
            {timestamp_html}
          </div>"""


CHAT_CSS = """
    /* 排版 1:1 实测自正在运行的 Codex 桌面端(CDP getComputedStyle)：
       正文 14px / 字重 430 / 行高 1.5 / #1a1c1f；用户气泡 16px；内容列宽 768px；
       链接=正文色无下划线；加粗 600；代码 14px。 */
    :root {
      color-scheme: light;
      --bg: #ffffff;
      --text: #1a1c1f;
      --muted: rgba(26, 28, 31, 0.6);
      --icon-muted: rgba(26, 28, 31, 0.49);
      --line: #e9e9ec;
      --user-bubble: rgba(26, 28, 31, 0.05);
      --code-bg: rgba(26, 28, 31, 0.04);
      --code-inline-bg: rgba(26, 28, 31, 0.06);
      --code-border: rgba(26, 28, 31, 0.08);
      --content-width: 768px;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
      --font-mono: ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      font-size: 14px;
      line-height: 1.5;
      font-weight: 430;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    .app { min-height: 100vh; display: grid; grid-template-rows: auto 1fr; }
    header {
      position: sticky;
      top: 0;
      z-index: 5;
      border-bottom: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.92);
      backdrop-filter: blur(12px);
    }
    .header-inner {
      position: relative;
      max-width: var(--content-width);
      margin: 0 auto;
      height: 44px;
      padding: 0 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .brand { min-width: 0; max-width: 70%; }
    h1 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: center;
      color: var(--text);
    }
    .toolbar {
      position: absolute;
      right: 18px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--icon-muted);
    }
    .model-picker { display: none; }
    .tool-button {
      width: 24px; height: 24px;
      display: grid; place-items: center;
      border: 0; background: transparent; color: currentColor; padding: 0;
    }
    .tool-button svg {
      width: 18px; height: 18px; fill: none; stroke: currentColor;
      stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round;
    }
    main {
      max-width: var(--content-width);
      margin: 0 auto;
      padding: 24px 24px 72px;
    }
    .message { margin: 0 0 24px; }
    .message-user { display: flex; justify-content: flex-end; }
    .user-stack {
      display: flex;
      max-width: 77%;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
    }
    .attachments { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
    .attachment-thumb {
      width: 76px; height: 76px; margin: 0; overflow: hidden;
      border: 1px solid var(--line); border-radius: 12px; background: #fafafa;
    }
    .attachment-missing {
      display: grid; place-items: center; grid-template-rows: 1fr auto;
      padding: 8px 6px 6px; color: var(--muted); font-size: 12px; text-align: center;
    }
    .attachment-missing span {
      display: grid; place-items: center; width: 28px; height: 28px;
      border-radius: 6px; background: #f1f1f1; font-size: 16px;
    }
    .attachment-missing figcaption { max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .attachment-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .user-bubble {
      max-width: 100%;
      border-radius: 20px;
      background: var(--user-bubble);
      padding: 8px 12px;
      font-size: 16px;
      font-weight: 430;
      line-height: 1.5;
      color: var(--text);
    }
    .assistant-status {
      display: flex; align-items: center; gap: 6px; margin: 0 0 8px;
      color: rgba(26, 28, 31, 0.65); font-size: 14px; font-weight: 430;
      cursor: default; list-style: none; user-select: none;
    }
    summary.assistant-status { width: fit-content; cursor: pointer; }
    summary.assistant-status::-webkit-details-marker { display: none; }
    .assistant-status .chevron { font-size: 16px; color: var(--muted); transition: transform .16s ease; }
    .processing-details[open] .chevron { transform: rotate(90deg); }
    .processing-log {
      margin: 0 0 14px; padding-top: 8px;
      border-top: 1px solid rgba(26, 28, 31, 0.05);
      color: rgba(26, 28, 31, 0.65); font-size: 14px; line-height: 1.5;
    }
    .processing-log p { margin: 0 0 10px; }
    .processing-log p:last-child, .processing-log :last-child { margin-bottom: 0; }
    .processing-log :first-child { margin-top: 0; }
    .processing-entry + .processing-entry { margin-top: 10px; }
    .assistant-rule { display: none; }
    .assistant-body { max-width: 100%; color: var(--text); font-size: 14px; font-weight: 430; line-height: 1.5; }
    .artifact-card, .changes-card {
      min-width: 0; border: 1px solid var(--line); border-radius: 12px;
      background: #fff; overflow: hidden; margin: 12px 0;
    }
    .artifact-card { display: flex; align-items: center; gap: 12px; padding: 10px 12px; }
    .card-icon {
      width: 34px; height: 34px; display: grid; place-items: center;
      border-radius: 8px; background: rgba(26,28,31,0.05); color: var(--muted);
    }
    .card-icon svg { width: 20px; height: 20px; }
    .artifact-title, .changes-title { font-weight: 600; font-size: 14px; }
    .artifact-subtitle, .changes-delta { color: var(--muted); font-size: 13px; }
    .changes-head {
      display: grid; grid-template-columns: 40px 1fr auto; gap: 12px; align-items: center;
      padding: 10px 12px; border-bottom: 1px solid var(--line);
    }
    .changes-actions { display: flex; align-items: center; gap: 12px; color: var(--text); font-weight: 500; font-size: 13px; }
    .changes-actions span:last-child {
      padding: 5px 10px; border: 1px solid var(--line); border-radius: 8px; background: #fff;
    }
    .undo-action { display: inline-flex; align-items: center; gap: 4px; color: var(--muted); }
    .undo-icon { width: 16px; height: 16px; flex: 0 0 auto; }
    .changes-row {
      display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 14px;
      padding: 7px 12px; border-top: 1px solid #f1f1f1; font-size: 13px;
    }
    .path { overflow-wrap: anywhere; font-family: var(--font-mono); }
    .delta-plus { color: #1a7f37; }
    .delta-minus { color: #cf222e; }
    .content { overflow-wrap: anywhere; }
    .content p { margin: 0 0 12px; }
    .content p:last-child, .content ul:last-child, .content ol:last-child,
    .content .table-wrap:last-child, .content .code-block:last-child { margin-bottom: 0; }
    /* Codex 的 markdown 标题被 Tailwind reset 成 inherit：与正文同字号同字重(14px/430)，不放大不加粗 */
    .content h1, .content h2, .content h3, .content h4, .content h5, .content h6 { margin: 12px 0 4px; line-height: 1.5; font-size: 14px; font-weight: 430; }
    .content ul { margin: 0 0 12px; padding-left: 16px; }
    .content ol { margin: 0 0 12px; padding-left: 20px; }
    .content li + li { margin-top: 4px; }
    .content li { line-height: 1.6; }
    .content strong { font-weight: 600; }
    .content em { font-style: italic; }
    .content blockquote { margin: 12px 0; padding: 2px 0 2px 12px; border-left: 2px solid #d6d6d9; color: var(--muted); }
    .content hr { border: 0; border-top: 1px solid var(--line); margin: 16px 0; }
    .table-wrap { margin: 12px 0; overflow-x: auto; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
    table { width: 100%; border-collapse: collapse; min-width: 460px; font-size: 13px; line-height: 1.45; }
    th, td { padding: 7px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { background: rgba(26,28,31,0.03); font-weight: 600; }
    tbody tr:last-child td { border-bottom: 0; }
    a { color: var(--text); text-decoration: none; }
    a:hover { text-decoration: underline; text-underline-offset: 2px; }
    code {
      border-radius: 4px; padding: 1px 5px; background: var(--code-inline-bg);
      font-family: var(--font-mono); font-size: 13px;
    }
    .code-block {
      margin: 12px 0; overflow: hidden; border-radius: 12px;
      border: 1px solid var(--code-border); background: var(--code-bg); color: var(--text);
    }
    .code-head { padding: 6px 12px; border-bottom: 1px solid var(--code-border); color: var(--muted); font-size: 12px; }
    pre { margin: 0; padding: 12px; overflow-x: auto; }
    pre code { border: 0; padding: 0; background: transparent; color: inherit; font-size: 13px; line-height: 1.5; white-space: pre; }
    .mention-chip, .skill-link {
      display: inline-flex; align-items: center; gap: 4px; vertical-align: baseline;
      color: var(--text); font-weight: 500; white-space: nowrap;
    }
    .skill-link svg { width: 15px; height: 15px; flex: 0 0 auto; }
    .mention-icon { color: var(--muted); }
    .chrome-dot {
      width: 13px; height: 13px; border-radius: 50%;
      background: conic-gradient(#4285f4 0 33%, #34a853 0 66%, #fbbc05 0 83%, #ea4335 0);
      box-shadow: inset 0 0 0 4px #fff; border: 1px solid var(--line);
    }
    .action-bar { display: flex; align-items: center; gap: 2px; margin-top: 6px; color: var(--icon-muted); }
    .action-btn { width: 26px; height: 26px; display: grid; place-items: center; border-radius: 10px; cursor: default; }
    .action-btn:hover { background: rgba(26,28,31,0.06); }
    .action-btn svg { width: 16px; height: 16px; }
    .action-flip svg { transform: rotate(180deg); }
    .action-time { margin-left: 6px; font-size: 12px; color: var(--muted); }
    @media (max-width: 820px) {
      :root { --content-width: 100%; }
      .header-inner { height: 48px; padding: 0 16px; }
      main { padding: 20px 16px 56px; }
      .toolbar { display: none; }
      .user-stack { max-width: 88%; }
    }
"""


# 当本地存在 Codex 真实样式表时,用它 + electron-light 主题做到逐像素一致;否则用下面的精简后备。
# 后备用 [class~="..."] 属性选择器命中 Codex 的 Tailwind class(免去特殊字符转义),只求"可读不破版"。
FALLBACK_CSS = """
:root{color-scheme:light}
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#1a1c1f;font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased}
[class~="flex"]{display:flex}[class~="inline-flex"]{display:inline-flex}[class~="contents"]{display:contents}
[class~="flex-col"]{flex-direction:column}
[class~="items-end"]{align-items:flex-end}[class~="items-center"]{align-items:center}
[class~="justify-end"]{justify-content:flex-end}[class~="justify-start"]{justify-content:flex-start}
[class~="gap-3"]{gap:12px}[class~="gap-2"]{gap:8px}[class~="gap-1"]{gap:4px}[class~="gap-0.5"]{gap:2px}
[class~="w-full"]{width:100%}[class~="min-w-0"]{min-width:0}[class~="relative"]{position:relative}[class~="h-5"]{height:20px}
[class~="text-left"]{text-align:left}[class~="whitespace-pre-wrap"]{white-space:pre-wrap}[class~="whitespace-pre"]{white-space:pre}
[class~="break-words"]{overflow-wrap:break-word}[class~="overflow-hidden"]{overflow:hidden}
[class~="text-size-chat"]{font-size:14px}[class~="text-size-chat-sm"]{font-size:12.5px}
[class~="bg-token-foreground/5"]{background:rgba(26,28,31,.05)}
[class~="rounded-2xl"]{border-radius:16px}[class~="rounded-md"]{border-radius:6px}[class~="max-w-[77%]"]{max-width:77%}
[class~="px-3"]{padding-left:12px;padding-right:12px}[class~="py-2"]{padding-top:8px;padding-bottom:8px}
[class~="text-token-text-secondary"]{color:rgba(26,28,31,.65)}[class~="text-token-text-tertiary"]{color:rgba(26,28,31,.5)}
[class~="text-token-foreground/60"]{color:rgba(26,28,31,.6)}[class~="text-xs"]{font-size:12px}
[class~="border-t"]{border-top:1px solid #e9e9ec}[class~="ml-1.5"]{margin-left:6px}
[class~="my-2"]{margin:8px 0}[class~="my-3"]{margin:12px 0}[class~="my-4"]{margin:16px 0}
[class~="mt-0"]{margin-top:0}[class~="mb-4"]{margin-bottom:16px}[class~="mb-2"]{margin-bottom:8px}[class~="mb-1.5"]{margin-bottom:6px}
[class~="mt-1.5"]{margin-top:6px}[class~="mt-3"]{margin-top:12px}[class~="mt-4"]{margin-top:16px}[class~="mt-5"]{margin-top:20px}[class~="pt-1"]{padding-top:4px}[class~="pl-4"]{padding-left:16px}
[class~="list-disc"]{list-style:disc}[class~="list-decimal"]{list-style:decimal}
[class~="heading-lg"]{font-size:18px;font-weight:600}[class~="heading-base"]{font-size:16px;font-weight:600}[class~="heading-subsection"]{font-size:14px;font-weight:600}
[class~="font-semibold"]{font-weight:600}[class~="italic"]{font-style:italic}[class~="border-l-2"]{border-left:2px solid #d6d6d9}
[class*="_inlineMarkdown_"]{background:rgba(26,28,31,.06);border-radius:4px;padding:2px 6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
[class*="rounded-lg"][class*="overflow-hidden"]{border:1px solid rgba(26,28,31,.08);background:rgba(26,28,31,.04);border-radius:10px;margin:16px 0}
pre{margin:0;padding:12px;overflow-x:auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
a{color:#0b66c3;text-decoration:none}a:hover{text-decoration:underline}
[class~="inline-mention-brand-aware"]{color:color-mix(in srgb,#0b66c3 80%,#1a1c1f 20%);font-weight:500;white-space:nowrap}
[class~="group/inline-mention"] svg{width:14px;height:14px;vertical-align:-2px;margin-right:1px}
[class~="group/inline-mention"]:hover [class~="inline-mention-brand-aware"]{text-decoration:underline}
[class~="px-0.5"]{padding-left:2px;padding-right:2px}
[aria-label="消息操作"] button{background:none;border:0;padding:4px;border-radius:8px;color:rgba(26,28,31,.5);cursor:default;display:inline-flex}
[aria-label="消息操作"] button:hover{background:rgba(26,28,31,.06)}
[class~="icon-xs"]{width:16px;height:16px}[class~="icon-2xs"]{width:14px;height:14px}[class~="rotate-180"]{transform:rotate(180deg)}svg{flex:0 0 auto}
.skill-link,.mention-chip{display:inline-flex;align-items:center;gap:4px;font-weight:500}.skill-link svg{width:15px;height:15px}
"""

# 两种模式都叠加的布局/卡片样式(codex-styles.css 不含这些自定义卡片类)。
LAYOUT_CSS = """
html,body{margin:0;background:#fff}
.share-wrap{max-width:768px;margin:0 auto;padding:28px 16px 64px;box-sizing:border-box}
.share-wrap [data-thread-find-target=conversation]{height:auto!important;max-height:none!important;overflow:visible!important}
.artifact-card,.changes-card{border:1px solid var(--color-token-border,#e9e9ec);border-radius:12px;background:#fff;margin:12px 0;overflow:hidden}
.artifact-card{display:flex;align-items:center;gap:12px;padding:10px 12px}
.changes-head{display:grid;grid-template-columns:40px 1fr auto;gap:12px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--color-token-border,#e9e9ec)}
.changes-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;padding:7px 12px;border-top:1px solid #f1f1f1;font-size:13px}
.delta-plus{color:#1a7f37}.delta-minus{color:#cf222e}.path{font-family:ui-monospace,monospace;overflow-wrap:anywhere}
.card-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:8px;background:rgba(26,28,31,.05)}.card-icon svg{width:20px;height:20px}
.artifact-title,.changes-title{font-weight:600}.artifact-subtitle,.changes-delta{color:rgba(26,28,31,.6);font-size:13px}
.changes-actions{display:flex;align-items:center;gap:12px;font-size:13px;color:rgba(26,28,31,.6)}
.attachment-thumb{width:76px;height:76px;border-radius:12px;overflow:hidden;border:1px solid #e9e9ec;margin:0}
.attachment-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.attachment-missing{display:grid;place-items:center;color:#999;font-size:12px;text-align:center}
"""


def _load_codex_styles() -> "str | None":
    """读取同目录下的 codex-styles.css(Codex 真实样式;本地自用资产,不随包公开分发)。"""
    path = Path(__file__).resolve().parent / "codex-styles.css"
    try:
        return path.read_text(encoding="utf-8") if path.exists() else None
    except Exception:
        return None


def render_html(data: dict[str, Any]) -> str:
    title = str(data.get("title") or "Codex Chat Share")
    messages = normalize_messages(data)
    prime_markdown(messages)

    rendered_messages = []
    for message in messages:
        if message["role"] == "user":
            rendered_messages.append(render_user_message(message))
        else:
            rendered_messages.append(render_assistant_message(message))

    conversation = (
        '<div data-thread-find-target="conversation" class="relative flex flex-col gap-3">'
        + "".join(rendered_messages)
        + "</div>"
    )

    codex_css = _load_codex_styles()
    base_css = codex_css if codex_css else FALLBACK_CSS
    html_class = "electron electron-light" if codex_css else "codex-clean"

    return f"""<!doctype html>
<html lang="zh-CN" class="{html_class}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{escape_text(title)}</title>
  <style>
{base_css}
{LAYOUT_CSS}
  </style>
</head>
<body>
  <div class="share-wrap">
{conversation}
  </div>
</body>
</html>
"""


def find_current_rollout() -> Path:
    """定位用户当前桌面会话的 rollout jsonl —— 纯读 ~/.codex，绝不启动/连接 Codex。
    优先读 state_5.sqlite 的 threads 表(桌面端权威会话库):取未归档、桌面来源(source='vscode')、
    updated_at 最新的一条的 rollout_path;读不到则回退扫 sessions 目录,取桌面来源里 mtime 最新的文件。"""
    home = Path.home()
    db = home / ".codex" / "state_5.sqlite"
    if db.exists():
        try:
            con = sqlite3.connect(str(db), timeout=2.0)
            try:
                row = con.execute(
                    "SELECT rollout_path FROM threads "
                    "WHERE archived=0 AND source='vscode' ORDER BY updated_at DESC LIMIT 1"
                ).fetchone()
            finally:
                con.close()
            if row and row[0] and Path(row[0]).exists():
                return Path(row[0])
        except Exception:
            pass  # 落到目录扫描
    sessions = home / ".codex" / "sessions"
    if sessions.exists():
        candidates = sorted(sessions.rglob("rollout-*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)
        for path in candidates[:60]:
            try:
                with path.open("r", encoding="utf-8") as fh:
                    head = fh.read(4096)
            except Exception:
                continue
            if '"originator":"Codex Desktop"' in head or '"source":"vscode"' in head:
                return path
        if candidates:
            return candidates[0]
    raise FileNotFoundError("未找到 Codex 会话 rollout 文件(~/.codex/sessions);请确认 Codex 桌面端用过至少一个会话")


def main() -> None:
    parser = argparse.ArgumentParser(description="渲染 Codex 聊天分享 HTML")
    parser.add_argument("--input", help="transcript JSON / Codex rollout jsonl 路径")
    parser.add_argument("--current", action="store_true",
                        help="自动定位并使用当前 Codex 桌面会话的 rollout jsonl(纯读 ~/.codex,不连接 Codex)")
    parser.add_argument("--output", help="输出 HTML 路径")
    parser.add_argument("--print-project-name", action="store_true", help="输出 PreviewShip 项目名 slug")
    args = parser.parse_args()

    if args.current:
        input_path = find_current_rollout()
        print(f"# 当前会话: {input_path}", file=sys.stderr)
    elif args.input:
        input_path = Path(args.input)
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
