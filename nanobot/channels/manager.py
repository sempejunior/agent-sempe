"""Channel manager for coordinating chat channels."""

from __future__ import annotations

import asyncio
import importlib
from pathlib import Path
from typing import Any

from loguru import logger

from nanobot.bus.queue import MessageBus
from nanobot.channels.base import BaseChannel
from nanobot.config.schema import Config

CHANNEL_MAP: dict[str, tuple[str, str]] = {
    "telegram": ("nanobot.channels.telegram", "TelegramChannel"),
    "whatsapp": ("nanobot.channels.whatsapp", "WhatsAppChannel"),
    "discord": ("nanobot.channels.discord", "DiscordChannel"),
    "feishu": ("nanobot.channels.feishu", "FeishuChannel"),
    "mochat": ("nanobot.channels.mochat", "MochatChannel"),
    "dingtalk": ("nanobot.channels.dingtalk", "DingTalkChannel"),
    "email": ("nanobot.channels.email", "EmailChannel"),
    "slack": ("nanobot.channels.slack", "SlackChannel"),
    "qq": ("nanobot.channels.qq", "QQChannel"),
}


def _create_channel_instance(
    name: str,
    config: Any,
    bus: MessageBus,
    *,
    owner_id: str | None = None,
    groq_api_key: str = "",
    on_allow_from_verified: Any = None,
) -> BaseChannel:
    if name not in CHANNEL_MAP:
        raise ValueError(f"Unknown channel: {name}")

    module_path, class_name = CHANNEL_MAP[name]
    mod = importlib.import_module(module_path)
    cls = getattr(mod, class_name)

    if name == "telegram":
        return cls(
            config,
            bus,
            groq_api_key=groq_api_key,
            owner_id=owner_id,
            on_allow_from_verified=on_allow_from_verified,
        )
    return cls(config, bus, owner_id=owner_id)


class ChannelManager:
    """Manages server-global and per-user chat channels."""

    def __init__(
        self,
        config: Config,
        bus: MessageBus,
        *,
        data_dir: Path | None = None,
        db: Any = None,
        repos: Any = None,
    ):
        self.config = config
        self.bus = bus
        self.data_dir = data_dir
        self.db = db
        self.repos = repos
        self.channels: dict[str, BaseChannel] = {}
        self.user_channels: dict[str, dict[str, BaseChannel]] = {}
        self._dispatch_task: asyncio.Task | None = None

        self._init_channels()

    def _init_channels(self) -> None:
        """Initialize server-global channels from config."""
        for name in CHANNEL_MAP:
            cfg = getattr(self.config.channels, name, None)
            if cfg and cfg.enabled:
                try:
                    self.channels[name] = _create_channel_instance(
                        name, cfg, self.bus,
                        groq_api_key=self.config.providers.groq.api_key,
                    )
                    logger.info("{} channel enabled", name)
                except ImportError as e:
                    logger.warning("{} channel not available: {}", name, e)

    def _init_single_channel(self, name: str) -> None:
        """Initialize a single server-global channel from current config."""
        cfg = getattr(self.config.channels, name, None)
        if not cfg:
            raise ValueError(f"No config for channel: {name}")
        self.channels[name] = _create_channel_instance(
            name, cfg, self.bus,
            groq_api_key=self.config.providers.groq.api_key,
        )
        logger.info("{} channel initialized", name)

    def _allow_from_verified_callback(self, user_id: str, channel_name: str) -> Any:
        async def _persist(old_code: str, sender_id: str) -> None:
            if not self.repos:
                return
            user = await self.repos.users.get_by_id(user_id)
            if not user:
                return
            channel_configs = user.get("channel_configs") or {}
            channel_cfg = dict(channel_configs.get(channel_name) or {})
            allow_from = list(channel_cfg.get("allow_from") or [])
            next_allow_from: list[str] = []
            for item in allow_from:
                if item == old_code:
                    if sender_id not in next_allow_from:
                        next_allow_from.append(sender_id)
                elif item and item not in next_allow_from:
                    next_allow_from.append(item)
            if sender_id not in next_allow_from:
                next_allow_from.append(sender_id)
            channel_cfg["allow_from"] = next_allow_from
            channel_configs[channel_name] = channel_cfg
            await self.repos.users.update(user_id, {"channel_configs": channel_configs})

        return _persist

    def create_user_channel(
        self,
        user_id: str,
        name: str,
        config: Any,
    ) -> BaseChannel:
        """Create the shared channel instance owned by a user.

        One instance per (user, channel): agents that enable the channel share
        it, and the agent for each conversation is resolved per message by the
        selection layer (``nanobot/client/selection.py``).
        """
        ch = _create_channel_instance(
            name, config, self.bus,
            owner_id=user_id,
            groq_api_key=self.config.providers.groq.api_key,
            on_allow_from_verified=self._allow_from_verified_callback(user_id, name),
        )
        self.user_channels.setdefault(user_id, {})[name] = ch
        logger.info("User {} channel {} created", user_id, name)
        return ch

    async def start_user_channel(self, user_id: str, name: str) -> asyncio.Task[None]:
        user_chs = self.user_channels.get(user_id, {})
        ch = user_chs.get(name)
        if not ch:
            raise ValueError(f"User {user_id} has no {name} channel")
        return asyncio.create_task(self._start_channel(f"{user_id}:{name}", ch))

    async def stop_user_channel(self, user_id: str, name: str) -> None:
        user_chs = self.user_channels.get(user_id, {})
        ch = user_chs.get(name)
        if not ch:
            return
        try:
            await ch.stop()
        except Exception as e:
            logger.error("Error stopping {}:{}: {}", user_id, name, e)
        user_chs.pop(name, None)
        if not user_chs:
            self.user_channels.pop(user_id, None)
        logger.info("User {} channel {} stopped", user_id, name)

    def get_user_channel_status(self, user_id: str) -> dict[str, dict[str, Any]]:
        user_chs = self.user_channels.get(user_id, {})
        return {
            name: {
                "running": ch.is_running,
                "last_error": getattr(ch, "_last_error", None),
            }
            for name, ch in user_chs.items()
        }

    async def _start_channel(self, label: str, channel: BaseChannel) -> None:
        try:
            channel._last_error = None
            await channel.start()
        except Exception as e:
            channel._running = False
            channel._last_error = str(e)
            logger.error("Failed to start channel {}: {}", label, e)

    async def start_all(self, *, repos: Any = None) -> None:
        """Start all server-global channels, restore per-user channels, and dispatch."""
        if repos is not None:
            self.repos = repos
        self._dispatch_task = asyncio.create_task(self._dispatch_outbound())

        if self.channels:
            tasks = []
            for name, channel in self.channels.items():
                logger.info("Starting {} channel...", name)
                tasks.append(asyncio.create_task(self._start_channel(name, channel)))
            await asyncio.gather(*tasks, return_exceptions=True)
        else:
            logger.warning("No channels enabled")

        if repos:
            await self._restore_user_channels(repos)

    async def _restore_user_channels(self, repos: Any) -> None:
        """Restore enabled per-user channels from DB on startup."""
        from nanobot.channels.registry import CHANNEL_META
        from nanobot.config.schema import ChannelsConfig
        from nanobot.secrets import resolve_channel_secret

        try:
            users = await repos.users.list_all()
        except Exception as e:
            logger.error("Failed to list users for channel restore: {}", e)
            return

        restored = 0
        for user in users:
            uid = user["user_id"]
            user_channel_configs = user.get("channel_configs") or {}
            agents = await repos.agents.list_agents(uid, status="active")
            if agents:
                enabled_channels = {
                    channel_name
                    for agent in agents
                    for channel_name, cfg in (agent.get("channel_configs") or {}).items()
                    if cfg.get("enabled") and channel_name in CHANNEL_MAP
                }
            else:
                enabled_channels = {
                    name for name, cfg in user_channel_configs.items()
                    if isinstance(cfg, dict) and cfg.get("enabled") and name in CHANNEL_MAP
                }
            for channel_name in sorted(enabled_channels):
                cfg_dict = dict(user_channel_configs.get(channel_name) or {})
                cfg_dict["enabled"] = True
                secret_keys = {
                    f["key"]
                    for f in CHANNEL_META.get(channel_name, {}).get("fields", [])
                    if f.get("type") == "password"
                }
                if self.db and self.data_dir:
                    for key in secret_keys:
                        value = cfg_dict.get(key)
                        if isinstance(value, str) and value.strip().lower() in {
                            "@vault", "vault", "@secret", "@secrets",
                        }:
                            secret = await resolve_channel_secret(
                                self.db, self.data_dir, uid, channel_name, key,
                            )
                            if secret:
                                cfg_dict[key] = secret
                try:
                    cfg_cls = getattr(ChannelsConfig(), channel_name).__class__
                    cfg = cfg_cls.model_validate(cfg_dict)
                    self.create_user_channel(uid, channel_name, cfg)
                    await self.start_user_channel(uid, channel_name)
                    restored += 1
                except Exception as e:
                    logger.warning(
                        "Failed to restore {}:{}: {}", uid, channel_name, e,
                    )

        if restored:
            logger.info("Restored {} user channel(s)", restored)

    async def stop_all(self) -> None:
        """Stop all channels (global + per-user) and the dispatcher."""
        logger.info("Stopping all channels...")

        if self._dispatch_task:
            self._dispatch_task.cancel()
            try:
                await self._dispatch_task
            except asyncio.CancelledError:
                pass

        for name, channel in self.channels.items():
            try:
                await channel.stop()
                logger.info("Stopped {} channel", name)
            except Exception as e:
                logger.error("Error stopping {}: {}", name, e)

        for user_id, user_chs in list(self.user_channels.items()):
            for name, channel in list(user_chs.items()):
                try:
                    await channel.stop()
                    logger.info("Stopped {}:{} channel", user_id, name)
                except Exception as e:
                    logger.error("Error stopping {}:{}: {}", user_id, name, e)
        self.user_channels.clear()

    async def _dispatch_outbound(self) -> None:
        """Dispatch outbound messages to the appropriate channel."""
        logger.info("Outbound dispatcher started")

        while True:
            try:
                msg = await asyncio.wait_for(
                    self.bus.consume_outbound(), timeout=1.0,
                )

                if msg.metadata.get("_progress"):
                    if msg.metadata.get("_tool_hint") and not self.config.channels.send_tool_hints:
                        continue
                    if not msg.metadata.get("_tool_hint") and not self.config.channels.send_progress:
                        continue

                channel = self._find_channel_for_outbound(msg)
                if channel:
                    try:
                        await channel.send(msg)
                    except Exception as e:
                        logger.error("Error sending to {}: {}", msg.channel, e)

            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

    def _find_channel_for_outbound(self, msg: Any) -> BaseChannel | None:
        """Find the channel instance for an outbound message: owner's, then global."""
        owner = msg.metadata.get("_owner_id")
        if owner:
            ch = self.user_channels.get(owner, {}).get(msg.channel)
            if ch:
                return ch
        ch = self.channels.get(msg.channel)
        if ch:
            return ch
        logger.warning(
            "No channel instance for outbound {} (owner={})", msg.channel, owner,
        )
        return None

    def get_channel(self, name: str) -> BaseChannel | None:
        return self.channels.get(name)

    def get_status(self) -> dict[str, Any]:
        return {
            name: {"enabled": True, "running": channel.is_running}
            for name, channel in self.channels.items()
        }

    @property
    def enabled_channels(self) -> list[str]:
        return list(self.channels.keys())
