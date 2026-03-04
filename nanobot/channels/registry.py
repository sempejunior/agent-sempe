"""Channel metadata registry for the web UI."""

from __future__ import annotations

CHANNEL_META: dict[str, dict] = {
    "telegram": {
        "label": "Telegram",
        "description": "Connect a Telegram bot to receive and send messages.",
        "docs_url": "https://core.telegram.org/bots#botfather",
        "fields": [
            {"key": "token", "label": "Bot Token", "type": "password", "required": True,
             "placeholder": "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
             "help": "Get from @BotFather on Telegram"},
            {"key": "proxy", "label": "Proxy URL", "type": "text", "required": False,
             "placeholder": "socks5://host:port"},
            {"key": "reply_to_message", "label": "Reply to messages", "type": "bool", "required": False},
            {"key": "allow_from", "label": "Allowed user IDs", "type": "list",
             "required": False, "placeholder": "123456789",
             "help": "Leave empty to allow everyone"},
        ],
    },
    "discord": {
        "label": "Discord",
        "description": "Connect a Discord bot to your server.",
        "docs_url": "https://discord.com/developers/applications",
        "fields": [
            {"key": "token", "label": "Bot Token", "type": "password", "required": True,
             "placeholder": "MTIz..."},
            {"key": "allow_from", "label": "Allowed user IDs", "type": "list",
             "required": False, "placeholder": "123456789012345678"},
        ],
    },
    "slack": {
        "label": "Slack",
        "description": "Connect a Slack app using Socket Mode.",
        "docs_url": "https://api.slack.com/apps",
        "fields": [
            {"key": "bot_token", "label": "Bot Token (xoxb-...)", "type": "password", "required": True,
             "placeholder": "xoxb-..."},
            {"key": "app_token", "label": "App Token (xapp-...)", "type": "password", "required": True,
             "placeholder": "xapp-..."},
            {"key": "reply_in_thread", "label": "Reply in thread", "type": "bool", "required": False},
            {"key": "react_emoji", "label": "Reaction emoji", "type": "text", "required": False,
             "placeholder": "eyes"},
            {"key": "group_policy", "label": "Group policy", "type": "text", "required": False,
             "placeholder": "mention"},
        ],
    },
    "whatsapp": {
        "label": "WhatsApp",
        "description": "Connect via WhatsApp bridge (requires matrix-whatsapp bridge).",
        "fields": [
            {"key": "bridge_url", "label": "Bridge WebSocket URL", "type": "text", "required": True,
             "placeholder": "ws://localhost:3001"},
            {"key": "bridge_token", "label": "Bridge Token", "type": "password", "required": False},
            {"key": "allow_from", "label": "Allowed phone numbers", "type": "list",
             "required": False, "placeholder": "5511999999999"},
        ],
    },
    "email": {
        "label": "Email",
        "description": "Receive emails via IMAP and reply via SMTP.",
        "fields": [
            {"key": "imap_host", "label": "IMAP Host", "type": "text", "required": True,
             "placeholder": "imap.gmail.com"},
            {"key": "imap_port", "label": "IMAP Port", "type": "number", "required": False,
             "placeholder": "993"},
            {"key": "imap_username", "label": "IMAP Username", "type": "text", "required": True,
             "placeholder": "you@gmail.com"},
            {"key": "imap_password", "label": "IMAP Password", "type": "password", "required": True},
            {"key": "smtp_host", "label": "SMTP Host", "type": "text", "required": True,
             "placeholder": "smtp.gmail.com"},
            {"key": "smtp_port", "label": "SMTP Port", "type": "number", "required": False,
             "placeholder": "587"},
            {"key": "smtp_username", "label": "SMTP Username", "type": "text", "required": True,
             "placeholder": "you@gmail.com"},
            {"key": "smtp_password", "label": "SMTP Password", "type": "password", "required": True},
            {"key": "from_address", "label": "From Address", "type": "text", "required": True,
             "placeholder": "you@gmail.com"},
            {"key": "allow_from", "label": "Allowed email addresses", "type": "list",
             "required": False, "placeholder": "friend@example.com"},
        ],
    },
    "dingtalk": {
        "label": "DingTalk",
        "description": "Connect a DingTalk bot using Stream mode.",
        "fields": [
            {"key": "client_id", "label": "Client ID", "type": "text", "required": True},
            {"key": "client_secret", "label": "Client Secret", "type": "password", "required": True},
            {"key": "allow_from", "label": "Allowed user IDs", "type": "list", "required": False},
        ],
    },
    "feishu": {
        "label": "Feishu / Lark",
        "description": "Connect a Feishu/Lark bot via WebSocket.",
        "fields": [
            {"key": "app_id", "label": "App ID", "type": "text", "required": True},
            {"key": "app_secret", "label": "App Secret", "type": "password", "required": True},
            {"key": "encrypt_key", "label": "Encrypt Key", "type": "password", "required": False},
            {"key": "verification_token", "label": "Verification Token", "type": "password",
             "required": False},
            {"key": "react_emoji", "label": "Reaction Emoji", "type": "text", "required": False,
             "placeholder": "THUMBSUP",
             "help": "Emoji key to react with when processing a message"},
            {"key": "allow_from", "label": "Allowed user IDs", "type": "list", "required": False},
        ],
    },
    "matrix": {
        "label": "Matrix / Element",
        "description": "Connect to a Matrix homeserver for secure, decentralized messaging.",
        "docs_url": "https://spec.matrix.org/latest/",
        "fields": [
            {"key": "homeserver", "label": "Homeserver URL", "type": "text", "required": True,
             "placeholder": "https://matrix.org"},
            {"key": "access_token", "label": "Access Token", "type": "password", "required": True,
             "help": "Bot user access token"},
            {"key": "user_id", "label": "Bot User ID", "type": "text", "required": True,
             "placeholder": "@bot:matrix.org"},
            {"key": "device_id", "label": "Device ID", "type": "text", "required": False,
             "help": "Optional device ID for E2EE sessions"},
            {"key": "e2ee_enabled", "label": "End-to-End Encryption", "type": "bool", "required": False},
            {"key": "group_policy", "label": "Group Policy", "type": "text", "required": False,
             "placeholder": "open",
             "help": "open = respond to all, mention = only when mentioned, allowlist = restricted"},
            {"key": "group_allow_from", "label": "Group Allowlist", "type": "list", "required": False,
             "placeholder": "!roomid:matrix.org",
             "help": "Room IDs allowed when group_policy=allowlist"},
            {"key": "allow_room_mentions", "label": "Allow @room mentions", "type": "bool", "required": False},
            {"key": "max_media_bytes", "label": "Max Media Size (bytes)", "type": "number", "required": False,
             "placeholder": "20971520",
             "help": "Max upload size in bytes. 0 to disable media."},
            {"key": "allow_from", "label": "Allowed user IDs", "type": "list", "required": False,
             "placeholder": "@user:matrix.org"},
        ],
    },
    "qq": {
        "label": "QQ",
        "description": "Connect a QQ bot using the botpy SDK.",
        "fields": [
            {"key": "app_id", "label": "App ID", "type": "text", "required": True},
            {"key": "secret", "label": "Secret", "type": "password", "required": True},
            {"key": "allow_from", "label": "Allowed user IDs", "type": "list", "required": False},
        ],
    },
}

CHANNEL_ORDER = [
    "telegram", "discord", "slack", "whatsapp", "matrix",
    "email", "dingtalk", "feishu", "qq",
]


def mask_secret(value: str) -> str:
    if not value or len(value) <= 4:
        return "****" if value else ""
    return f"{'*' * min(8, len(value) - 4)}{value[-4:]}"


def get_channel_config_dict(channels_config: object, name: str) -> dict:
    cfg = getattr(channels_config, name, None)
    if cfg is None:
        return {}
    return cfg.model_dump(by_alias=False)


def mask_channel_config(name: str, config_dict: dict) -> dict:
    meta = CHANNEL_META.get(name, {})
    secret_keys = {f["key"] for f in meta.get("fields", []) if f.get("type") == "password"}
    masked = {}
    for k, v in config_dict.items():
        if k in secret_keys and isinstance(v, str) and v:
            masked[k] = mask_secret(v)
        else:
            masked[k] = v
    return masked
