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


def render_markdown(markdown: str) -> str:
    blocks: list[tuple[str, str, str]] = []

    def keep_code(match: re.Match[str]) -> str:
        idx = len(blocks)
        lang = match.group(1).strip()
        code = match.group(2).rstrip("\n")
        blocks.append((f"@@CODE_BLOCK_{idx}@@", lang, code))
        return blocks[-1][0]

    protected = CODE_BLOCK_RE.sub(keep_code, markdown.replace("\r\n", "\n"))
    parts: list[str] = []
    list_type: str | None = None
    lines = protected.split("\n")

    def close_list() -> None:
        nonlocal list_type
        if list_type:
            parts.append(f"</{list_type}>")
            list_type = None

    def open_list(kind: str) -> None:
        nonlocal list_type
        if list_type == kind:
            return
        close_list()
        parts.append(f"<{kind}>")
        list_type = kind

    def is_table_separator(value: str) -> bool:
        cells = split_table_row(value)
        return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell.strip()) for cell in cells)

    def split_table_row(value: str) -> list[str]:
        stripped = value.strip()
        if "|" not in stripped:
            return []
        if stripped.startswith("|"):
            stripped = stripped[1:]
        if stripped.endswith("|"):
            stripped = stripped[:-1]
        return [cell.strip() for cell in stripped.split("|")]

    def render_table(header: list[str], rows: list[list[str]]) -> str:
        head = "".join(f"<th>{render_inline(cell)}</th>" for cell in header)
        body = ""
        for row in rows:
            cells = row[: len(header)] + [""] * max(0, len(header) - len(row))
            body += "<tr>" + "".join(f"<td>{render_inline(cell)}</td>" for cell in cells[: len(header)]) + "</tr>"
        return f'<div class="table-wrap"><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>'

    i = 0
    while i < len(lines):
        raw_line = lines[i]
        line = raw_line.rstrip()
        if not line:
            close_list()
            i += 1
            continue

        code_match = re.fullmatch(r"@@CODE_BLOCK_(\d+)@@", line)
        if code_match:
            close_list()
            _, lang, code = blocks[int(code_match.group(1))]
            lang_label = escape_text(lang or "text")
            parts.append(
                f'<div class="code-block"><div class="code-head">{lang_label}</div>'
                f"<pre><code>{escape_text(code)}</code></pre></div>"
            )
            i += 1
            continue

        if i + 1 < len(lines) and is_table_separator(lines[i + 1]):
            header_cells = split_table_row(line)
            table_rows: list[list[str]] = []
            i += 2
            while i < len(lines) and split_table_row(lines[i]):
                table_rows.append(split_table_row(lines[i]))
                i += 1
            if header_cells:
                close_list()
                parts.append(render_table(header_cells, table_rows))
                continue

        heading = re.match(r"^(#{1,3})\s+(.+)$", line)
        if heading:
            close_list()
            level = len(heading.group(1)) + 2
            parts.append(f"<h{level}>{render_inline(heading.group(2))}</h{level}>")
            i += 1
            continue

        item = re.match(r"^\s*[-*]\s+(.+)$", line)
        if item:
            open_list("ul")
            parts.append(f"<li>{render_inline(item.group(1))}</li>")
            i += 1
            continue

        ordered_item = re.match(r"^\s*\d+[.)]\s+(.+)$", line)
        if ordered_item:
            open_list("ol")
            parts.append(f"<li>{render_inline(ordered_item.group(1))}</li>")
            i += 1
            continue

        quote = re.match(r"^\s*>\s+(.+)$", line)
        if quote:
            close_list()
            parts.append(f"<blockquote>{render_inline(quote.group(1))}</blockquote>")
            i += 1
            continue

        if re.fullmatch(r"\s*[-*_]{3,}\s*", line):
            close_list()
            parts.append("<hr />")
            i += 1
            continue

        close_list()
        parts.append(f"<p>{render_inline(line)}</p>")
        i += 1

    close_list()
    return "\n".join(parts)


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


def render_user_message(message: dict[str, Any]) -> str:
    attachments = "".join(render_attachment(item) for item in message.get("attachments", []))
    attachment_block = f'<div class="attachments">{attachments}</div>' if attachments else ""
    bubble = (
        f"""
          <div class="user-bubble content">
            {render_markdown(message["content"])}
          </div>"""
        if str(message.get("content") or "").strip()
        else ""
    )
    return f"""
      <article class="message message-user">
        <div class="user-stack">
          {attachment_block}
          {bubble}
        </div>
      </article>"""


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
                <span>撤销 ↶</span>
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
    body = (
        f"""
        <div class="assistant-body content">
          {body_content}
          {artifacts}
          {changes}
          {action_bar}
        </div>"""
        if body_content or artifacts or changes or action_bar
        else ""
    )
    return f"""
      <article class="message message-assistant">
        {status}
        {body}
      </article>"""


def render_processing_status(duration: str, details: list[str]) -> str:
    label = f"已处理 {duration}" if is_duration(duration) else "已处理"
    if not details:
        return f"""
        <div class="assistant-status">
          <span>{escape_text(label)}</span>
          <span class="chevron">›</span>
        </div>
        <div class="assistant-rule"></div>"""

    detail_html = "\n".join(
        f'<div class="processing-entry">{render_markdown(item)}</div>' for item in details if item.strip()
    )
    return f"""
        <details class="processing-details">
          <summary class="assistant-status">
            <span>{escape_text(label)}</span>
            <span class="chevron">›</span>
          </summary>
          <div class="processing-log">
            {detail_html}
          </div>
        </details>
        <div class="assistant-rule"></div>"""


def render_action_bar(message: dict[str, Any]) -> str:
    timestamp = str(message.get("timestamp") or "").strip()
    timestamp_html = f"<span>{escape_text(timestamp)}</span>" if timestamp else ""
    return f"""
          <div class="action-bar" aria-label="消息操作">
            <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 8h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z"></path><path d="M4 15H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></span>
            <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 11v10"></path><path d="M15 5.5 14 11h6.2a2 2 0 0 1 2 2.3l-1 6A2 2 0 0 1 19.2 21H7"></path><path d="M7 11H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h3"></path></svg></span>
            <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 13V3"></path><path d="M15 18.5 14 13h6.2a2 2 0 0 0 2-2.3l-1-6A2 2 0 0 0 19.2 3H7"></path><path d="M7 13H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3"></path></svg></span>
            <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 17 17 7"></path><path d="M8 7h9v9"></path></svg></span>
            {timestamp_html}
          </div>"""


def render_html(data: dict[str, Any]) -> str:
    title = str(data.get("title") or "Codex Chat Share")
    messages = normalize_messages(data)

    rendered_messages = []
    for message in messages:
        role = message["role"]
        if role == "user":
            rendered_messages.append(render_user_message(message))
            continue
        rendered_messages.append(render_assistant_message(message))

    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{escape_text(title)}</title>
  <style>
    :root {{
      color-scheme: light;
      --bg: #ffffff;
      --text: #1f2328;
      --muted: #8f9095;
      --line: #ebebeb;
      --user: #f3f3f3;
      --link: #1a73e8;
      --chip: #eeeeee;
      --card: #ffffff;
      --code-bg: #f2f2f2;
      --code-border: #dfdfdf;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans", Arial, sans-serif;
      font-size: 17px;
      line-height: 1.55;
      letter-spacing: 0;
      font-kerning: normal;
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
    }}
    .app {{
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto 1fr;
    }}
    header {{
      position: sticky;
      top: 0;
      z-index: 5;
      border-bottom: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.96);
      backdrop-filter: blur(14px);
    }}
    .header-inner {{
      width: 100%;
      margin: 0 auto;
      min-height: 70px;
      padding: 0 31px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }}
    .brand {{
      min-width: 0;
    }}
    h1 {{
      margin: 0;
      font-size: 22px;
      font-weight: 650;
      letter-spacing: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }}
    .toolbar {{
      display: flex;
      align-items: center;
      gap: 20px;
      color: #8c8c8c;
    }}
    .tool-button {{
      width: 28px;
      height: 28px;
      display: grid;
      place-items: center;
      border: 0;
      background: transparent;
      color: currentColor;
      padding: 0;
    }}
    .tool-button svg {{
      width: 24px;
      height: 24px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.9;
      stroke-linecap: round;
      stroke-linejoin: round;
    }}
    .model-picker {{
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 48px;
      padding: 0 14px;
      border: 1px solid #e8e8e8;
      border-radius: 18px;
      background: #fff;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
      color: #5f6368;
    }}
    main {{
      width: min(100%, 1180px);
      margin: 0 auto;
      padding: 34px 38px 86px;
    }}
    .message {{
      margin: 0 0 62px;
    }}
    .message-user {{
      display: flex;
      justify-content: flex-end;
      padding-left: min(240px, 22vw);
    }}
    .user-stack {{
      display: flex;
      max-width: min(900px, 74vw);
      flex-direction: column;
      align-items: flex-end;
      gap: 10px;
    }}
    .attachments {{
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      min-height: 0;
    }}
    .attachment-thumb {{
      width: 84px;
      height: 84px;
      margin: 0;
      overflow: hidden;
      border: 1px solid #dedede;
      border-radius: 10px;
      background: #fafafa;
    }}
    .attachment-missing {{
      display: grid;
      place-items: center;
      grid-template-rows: 1fr auto;
      padding: 9px 7px 7px;
      color: #8d9197;
      font-size: 12px;
      text-align: center;
    }}
    .attachment-missing span {{
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: 7px;
      background: #f1f1f1;
      font-size: 19px;
    }}
    .attachment-missing figcaption {{
      max-width: 100%;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }}
    .attachment-thumb img {{
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }}
    .user-bubble {{
      max-width: min(900px, 74vw);
      border-radius: 20px;
      background: var(--user);
      padding: 10px 16px;
      font-size: 17px;
      font-weight: 570;
      line-height: 1.48;
      color: #202124;
    }}
    .assistant-status {{
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 12px;
      color: #8b8e93;
      font-size: 18px;
      font-weight: 600;
      cursor: default;
      list-style: none;
      user-select: none;
    }}
    summary.assistant-status {{
      width: fit-content;
      cursor: pointer;
    }}
    summary.assistant-status::-webkit-details-marker {{
      display: none;
    }}
    .assistant-status .chevron {{
      font-size: 28px;
      color: #9aa0a6;
      transition: transform .16s ease;
    }}
    .processing-details[open] .chevron {{
      transform: rotate(90deg);
    }}
    .processing-log {{
      max-height: 260px;
      overflow: auto;
      margin: 2px 0 18px;
      padding: 14px 16px;
      border: 1px solid #ececec;
      border-radius: 12px;
      background: #fafafa;
      color: #50545a;
      font-size: 15px;
      line-height: 1.55;
    }}
    .processing-entry + .processing-entry {{
      margin-top: 14px;
      padding-top: 14px;
      border-top: 1px solid #ececec;
    }}
    .assistant-rule {{
      height: 1px;
      background: var(--line);
      margin-bottom: 24px;
    }}
    .assistant-body {{
      max-width: 100%;
      color: #202124;
      font-size: 18px;
      font-weight: 510;
      line-height: 1.58;
    }}
    .artifact-card,
    .changes-card {{
      min-width: 0;
      border: 1px solid var(--line);
      border-radius: 11px;
      background: var(--card);
      overflow: hidden;
      margin: 18px 0;
      box-shadow: 0 1px 1px rgba(0, 0, 0, 0.025);
    }}
    .artifact-card {{
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 14px 18px;
    }}
    .card-icon {{
      width: 48px;
      height: 48px;
      display: grid;
      place-items: center;
      border-radius: 12px;
      background: #f7f7f7;
      color: #6d7075;
    }}
    .card-icon svg {{
      width: 27px;
      height: 27px;
    }}
    .artifact-title,
    .changes-title {{
      font-weight: 750;
    }}
    .artifact-subtitle,
    .changes-delta {{
      color: #6f7378;
      font-size: 16px;
    }}
    .changes-head {{
      display: grid;
      grid-template-columns: 52px 1fr auto;
      gap: 16px;
      align-items: center;
      padding: 14px 18px;
      border-bottom: 1px solid rgba(229, 225, 216, 0.78);
    }}
    .changes-actions {{
      display: flex;
      align-items: center;
      gap: 20px;
      color: #202124;
      font-weight: 650;
    }}
    .changes-actions span:last-child {{
      padding: 7px 14px;
      border: 1px solid #e5e5e5;
      border-radius: 12px;
      background: #fff;
      box-shadow: 0 1px 1px rgba(0, 0, 0, 0.03);
    }}
    .changes-row {{
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 18px;
      padding: 9px 18px;
      border-top: 1px solid #f1f1f1;
    }}
    .path {{
      overflow-wrap: anywhere;
    }}
    .delta-plus {{
      color: #00a63e;
    }}
    .delta-minus {{
      color: #d12f2f;
    }}
    .content {{
      overflow-wrap: anywhere;
    }}
    .content p {{
      margin: 0 0 16px;
    }}
    .content p:last-child,
    .content ul:last-child,
    .content ol:last-child,
    .content .table-wrap:last-child,
    .content .code-block:last-child {{
      margin-bottom: 0;
    }}
    .content h3,
    .content h4,
    .content h5 {{
      margin: 24px 0 10px;
      font-size: 18px;
      line-height: 1.35;
      font-weight: 700;
    }}
    .content ul {{
      margin: 0 0 18px;
      padding-left: 28px;
    }}
    .content ol {{
      margin: 0 0 18px;
      padding-left: 30px;
    }}
    .content li + li {{
      margin-top: 8px;
    }}
    .content strong {{
      font-weight: 720;
    }}
    .content em {{
      font-style: italic;
    }}
    .content blockquote {{
      margin: 14px 0 18px;
      padding: 8px 0 8px 15px;
      border-left: 3px solid #d6d6d6;
      color: #5f6368;
    }}
    .content hr {{
      border: 0;
      border-top: 1px solid var(--line);
      margin: 22px 0;
    }}
    .table-wrap {{
      margin: 16px 0 18px;
      overflow-x: auto;
      border: 1px solid var(--line);
      border-radius: 9px;
      background: #fff;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      min-width: 520px;
      font-size: 15px;
      line-height: 1.45;
    }}
    th,
    td {{
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
    }}
    th {{
      background: #fafafa;
      font-weight: 700;
    }}
    tbody tr:last-child td {{
      border-bottom: 0;
    }}
    a {{
      color: var(--link);
      text-decoration: none;
      font-weight: 650;
    }}
    a:hover {{
      text-decoration: underline;
      text-underline-offset: 2px;
    }}
    code {{
      border: 1px solid #e7e7e7;
      border-radius: 7px;
      padding: 1px 7px;
      background: var(--chip);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.9em;
    }}
    .code-block {{
      margin: 16px 0;
      overflow: hidden;
      border-radius: 7px;
      border: 1px solid var(--code-border);
      background: var(--code-bg);
      color: #202124;
    }}
    .code-head {{
      padding: 9px 13px;
      border-bottom: 1px solid var(--code-border);
      color: #737373;
      font-size: 13px;
    }}
    pre {{
      margin: 0;
      padding: 14px;
      overflow-x: auto;
    }}
    pre code {{
      border: 0;
      padding: 0;
      background: transparent;
      color: inherit;
      font-size: 13px;
      line-height: 1.5;
      white-space: pre;
    }}
    .mention-chip,
    .skill-link {{
      display: inline-flex;
      align-items: center;
      gap: 5px;
      vertical-align: baseline;
      color: var(--link);
      font-weight: 750;
      white-space: nowrap;
    }}
    .skill-link svg {{
      width: 16px;
      height: 16px;
      flex: 0 0 auto;
    }}
    .mention-icon {{
      color: var(--link);
    }}
    .chrome-dot {{
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: conic-gradient(#4285f4 0 33%, #34a853 0 66%, #fbbc05 0 83%, #ea4335 0);
      box-shadow: inset 0 0 0 4px #fff;
      border: 1px solid #d6d6d6;
    }}
    .action-bar {{
      display: flex;
      align-items: center;
      gap: 18px;
      margin-top: 18px;
      color: #96989d;
      font-size: 15px;
      font-weight: 600;
    }}
    .action-bar svg {{
      width: 17px;
      height: 17px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }}
    @media (max-width: 760px) {{
      body {{
        font-size: 16px;
      }}
      .header-inner {{
        min-height: 56px;
        padding: 0 16px;
      }}
      h1 {{
        font-size: 19px;
      }}
      .toolbar {{
        display: none;
      }}
      main {{
        padding: 30px 18px 54px;
      }}
      .message {{
        margin-bottom: 48px;
      }}
      .message-user {{
        padding-left: 0;
      }}
      .user-stack {{
        max-width: 100%;
      }}
      .user-bubble {{
        max-width: 100%;
        border-radius: 18px;
        padding: 11px 14px;
      }}
      .assistant-status {{
        font-size: 17px;
      }}
      .processing-log {{
        max-height: 220px;
        font-size: 14px;
      }}
      .content h3,
      .content h4,
      .content h5 {{
        font-size: 17px;
      }}
      .artifact-card,
      .changes-card {{
        border-radius: 12px;
      }}
      .artifact-card,
      .changes-head,
      .changes-row {{
        padding: 12px 14px;
      }}
      .card-icon {{
        width: 44px;
        height: 44px;
        border-radius: 10px;
        font-size: 22px;
      }}
      .attachment-thumb {{
        width: 72px;
        height: 72px;
      }}
      .artifact-subtitle,
      .changes-delta {{
        font-size: 14px;
      }}
    }}
  </style>
</head>
<body>
  <div class="app">
    <header>
      <div class="header-inner">
        <div class="brand">
          <h1>{escape_text(title)}</h1>
        </div>
        <nav class="toolbar" aria-label="Codex toolbar">
          <div class="model-picker" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" role="img"><rect x="5" y="5" width="14" height="14" rx="3" fill="#202124"/><path d="M12 7.5 17 10v5l-5 2.5L7 15v-5l5-2.5Z" fill="#fff" opacity=".92"/></svg>
            <svg width="16" height="16" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <span class="tool-button" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M4 7h3"></path><path d="M11 7h9"></path><path d="M4 12h3"></path><path d="M11 12h9"></path><path d="M4 17h3"></path><path d="M11 17h9"></path><circle cx="7" cy="7" r="1.5"></circle><circle cx="7" cy="12" r="1.5"></circle><circle cx="7" cy="17" r="1.5"></circle></svg>
          </span>
          <span class="tool-button" aria-hidden="true">
            <svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2.5"></rect><path d="M8 17h8"></path></svg>
          </span>
          <span class="tool-button" aria-hidden="true">
            <svg viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="16" rx="2.5"></rect><path d="M15 4v16"></path></svg>
          </span>
        </nav>
      </div>
    </header>
    <main>
{''.join(rendered_messages)}
    </main>
  </div>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description="渲染 Codex 聊天分享 HTML")
    parser.add_argument("--input", required=True, help="transcript JSON 路径")
    parser.add_argument("--output", help="输出 HTML 路径")
    parser.add_argument("--print-project-name", action="store_true", help="输出 PreviewShip 项目名 slug")
    args = parser.parse_args()

    input_path = Path(args.input)
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
