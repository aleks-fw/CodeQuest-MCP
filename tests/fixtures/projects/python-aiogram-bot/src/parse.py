def parse_command(text: str) -> tuple[str | None, list[str]]:
    trimmed = text.strip()
    if not trimmed.startswith("/"):
        return None, trimmed.split() if trimmed else []
    head, *args = trimmed.split()
    command = head[1:].split("@")[0]
    return (command or None), args