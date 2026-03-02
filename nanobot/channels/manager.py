"""Channel manager for coordinating chat channels."""

from __future__ import annotations

import asyncio
import importlib
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
) -> BaseChannel:
    if name not in CHANNEL_MAP:
        raise ValueError(f"Unknown channel: {name}")

    module_path, class_name = CHANNEL_MAP[name]
    mod = importlib.import_module(module_path)
    cls = getattr(mod, class_name)

    if name == "telegram":
        return cls(config, bus, groq_api_key=groq_api_key, owner_id=owner_id)
    return cls(config, bus, owner_id=owner_id)


class ChannelManager:
    """Manages server-global and per-user chat channels."""

    def __init__(self, config: Config, bus: MessageBus):
        self.config = config
        self.bus = bus
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

    def create_user_channel(
        self,
        user_id: str,
        name: str,
        config: Any,
    ) -> BaseChannel:
        """Create a channel instance owned by a specific user."""
        ch = _create_channel_instance(
            name, config, self.bus,
            owner_id=user_id,
            groq_api_key=self.config.providers.groq.api_key,
        )
        self.user_channels.setdefault(user_id, {})[name] = ch
        logger.info("User {} channel {} created", user_id, name)
        return ch

    async def start_user_channel(self, user_id: str, name: str) -> None:
        user_chs = self.user_channels.get(user_id, {})
        ch = user_chs.get(name)
        if not ch:
            raise ValueError(f"User {user_id} has no {name} channel")
        asyncio.create_task(self._start_channel(f"{user_id}:{name}", ch))

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
            name: {"running": ch.is_running}
            for name, ch in user_chs.items()
        }

    async def _start_channel(self, label: str, channel: BaseChannel) -> None:
        try:
            await channel.start()
        except Exception as e:
            logger.error("Failed to start channel {}: {}", label, e)

    async def start_all(self, *, repos: Any = None) -> None:
        """Start all server-global channels, restore per-user channels, and dispatch."""
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
        from nanobot.config.schema import ChannelsConfig

        try:
            users = await repos.users.list_all()
        except Exception as e:
            logger.error("Failed to list users for channel restore: {}", e)
            return

        restored = 0
        for user in users:
            uid = user["user_id"]
            channel_configs = user.get("channel_configs") or {}
            for channel_name, cfg_dict in channel_configs.items():
                if not cfg_dict.get("enabled") or channel_name not in CHANNEL_MAP:
                    continue
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
                else:
                    logger.warning("Unknown channel: {}", msg.channel)

            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

    def _find_channel_for_outbound(self, msg: Any) -> BaseChannel | None:
        """Find the right channel instance for an outbound message."""
        owner = msg.metadata.get("_owner_id")
        if owner:
            user_chs = self.user_channels.get(owner, {})
            ch = user_chs.get(msg.channel)
            if ch:
                return ch
        ch = self.channels.get(msg.channel)
        if ch:
            return ch
        for user_chs in self.user_channels.values():
            ch = user_chs.get(msg.channel)
            if ch:
                return ch
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
