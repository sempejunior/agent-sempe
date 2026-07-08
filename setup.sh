#!/usr/bin/env bash
#
# nanobot setup — installs the only host prerequisites (Docker, Docker Compose,
# make, git) when missing, then boots the dev stack with `make dev`.
# Everything else (Python, Node, dependencies) is built inside Docker.
#
# Usage: ./setup.sh   (or: make setup)
#
set -euo pipefail

info()  { printf '\033[36m==>\033[0m %s\n' "$1"; }
ok()    { printf '\033[32m ✔\033[0m %s\n' "$1"; }
warn()  { printf '\033[33m ! \033[0m %s\n' "$1"; }
die()   { printf '\033[31m ✗\033[0m %s\n' "$1" >&2; exit 1; }

has() { command -v "$1" >/dev/null 2>&1; }

OS="$(uname -s)"

install_brew() {
  has brew && return 0
  info "Homebrew não encontrado. Instalando..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Adiciona o brew ao PATH da sessão atual (Apple Silicon e Intel)
  if [ -x /opt/homebrew/bin/brew ]; then eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then eval "$(/usr/local/bin/brew shellenv)"; fi
}

wait_for_docker() {
  info "Aguardando o Docker ficar pronto..."
  for _ in $(seq 1 60); do
    if docker info >/dev/null 2>&1; then ok "Docker está rodando."; return 0; fi
    sleep 2
  done
  die "Docker não respondeu. Abra o Docker Desktop manualmente e rode ./setup.sh de novo."
}

setup_macos() {
  install_brew
  has git  || { info "Instalando git...";  brew install git; }
  has make || { info "Instalando make..."; brew install make; }
  if ! has docker; then
    info "Instalando Docker Desktop..."
    brew install --cask docker
    warn "Abra o app 'Docker' uma vez para aceitar os termos (necessário na 1ª vez)."
    open -a Docker || true
  fi
  wait_for_docker
}

setup_linux() {
  if ! has sudo; then die "Preciso de sudo para instalar pacotes no Linux."; fi
  if has apt-get; then
    sudo apt-get update -y
    has git  || sudo apt-get install -y git
    has make || sudo apt-get install -y make
    if ! has docker; then
      info "Instalando Docker Engine..."
      curl -fsSL https://get.docker.com | sudo sh
      sudo usermod -aG docker "$USER" || true
      warn "Você foi adicionado ao grupo 'docker'. Talvez precise deslogar/logar de novo."
    fi
  else
    die "Gerenciador de pacotes não suportado automaticamente. Instale Docker, make e git manualmente."
  fi
  wait_for_docker
}

info "Detectando prerequisitos (Docker, Docker Compose, make, git)..."
case "$OS" in
  Darwin) setup_macos ;;
  Linux)  setup_linux ;;
  *)      die "SO não suportado: $OS. Instale Docker, make e git manualmente." ;;
esac

# Docker Compose v2 vem embutido no Docker moderno como `docker compose`
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 não encontrado. Atualize o Docker."
ok "Todos os prerequisitos presentes."

info "Subindo o ambiente de desenvolvimento (make dev)..."
exec make dev
