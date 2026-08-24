#!/usr/bin/env bash
# 安装社区版微信开发者工具（Linux）用于本 E2E 环境。
#
# 依据：官方 stable（2.02 / 2.01 世代）无 Linux 包（已核对版本配置 + 下载目录 +
# 官方 CLI 文档），本环境（magic 确认走「方案 A」）选用社区移植版
# msojocs/wechat-web-devtools-linux（活跃维护，最新版 v2.01.2510290-2，2026-04-15）。
#
# 用法：
#   scripts/install-devtools.sh                 # 安装到 ~/wechat-devtools
#   INSTALL_DIR=/path scripts/install-devtools.sh
#
# 非 root 用 `dpkg -x` 解包到用户目录；root/CI 可改用 `apt/dpkg -i` 装到系统。
# 本脚本被 CI（.github/workflows/e2e.yml）复用，改动 URL/SHA256 前请先下载核对。
set -euo pipefail

# 资源名与 SHA256 为 msojocs 仓库「当前已发布」的 v2.01.2510290-2 构建
# （2026-06 核对：release 资产名为 Debian 包全名；nw + wechat-devtools-cli 与
# 本地已验证可用的构建逐字节一致）。上游若重新发布同 tag，请重新取 sha256。
RELEASE="v2.01.2510290-2"
DEB_NAME="io.github.msojocs.wechat-devtools-linux_2.01.2510290-2_amd64.deb"
URL="https://github.com/msojocs/wechat-web-devtools-linux/releases/download/${RELEASE}/${DEB_NAME}"
SHA256="f7348bcf60e66257c1068ca36c35f3a9249cb52e541a8e201007d408d99b889d"

INSTALL_DIR="${INSTALL_DIR:-$HOME/wechat-devtools}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

command -v dpkg >/dev/null 2>&1 || { echo "需要 dpkg（Debian/Ubuntu 系）" >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "需要 curl" >&2; exit 1; }

echo "==> 下载 ${DEB_NAME}"
curl -fsSL -o "${WORK}/${DEB_NAME}" "${URL}"

echo "==> 校验 sha256"
echo "${SHA256}  ${WORK}/${DEB_NAME}" | sha256sum -c -

echo "==> 解包到 ${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}"
dpkg -x "${WORK}/${DEB_NAME}" "${INSTALL_DIR}"

# 定位 files/bin（含 nwjs/ 与 bin/wechat-devtools-cli）
BIN_DIR="$(find "${INSTALL_DIR}/app/opt/apps" -maxdepth 3 -type d -name bin -path '*files/bin' 2>/dev/null | head -n1 || true)"
if [ -z "${BIN_DIR}" ] || [ ! -e "${BIN_DIR}/bin/wechat-devtools-cli" ]; then
  echo "⚠️  未能定位 CLI，请检查 ${INSTALL_DIR}/app/opt/apps 下布局" >&2
  exit 1
fi

echo ""
echo "==> 安装完成"
echo "    DevTools 根目录 : ${BIN_DIR}"
echo "    CLI             : ${BIN_DIR}/bin/wechat-devtools-cli"
echo ""
echo "下一步（详见 docs/environment.md）："
echo "    # 构建/校验（scripts/devtools-build.js 会自动起 Xvfb + 拉起 IDE）："
echo "    npm run build"
echo "    # 手动登录（扫码）："
echo "    DISPLAY=:97 ${BIN_DIR}/bin/wechat-devtools-cli login"
echo "    # 查询登录态："
echo "    DISPLAY=:97 ${BIN_DIR}/bin/wechat-devtools-cli islogin"