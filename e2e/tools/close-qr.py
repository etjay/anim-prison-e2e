#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# close-qr（ANIM-25，v3）—— 等「预览二维码」卡片出现后关闭它（模拟器右上角）。
#
# v2 教训：固定 6s 后点击太早——卡片在 App 完全编译就绪后才弹出（~30s+），点击时卡片尚未出现，
#   等于没点。v3 改为「轮询检测卡片出现 → 点击关闭 → 采样确认关闭」，并重试。
#
# 卡片：DevTools 模拟器内部 redux WINDOW_SET_PREVIEW_COMPONENT 弹出的 in-simulator 卡片，
#   1280×800 布局下约 x1005-1185, y135-315，亮色（白/浅）卡片、暗色背景 → 用区域平均亮度检测。
#   注意：绝不关闭 DevTools 主窗口（v1 误伤教训）；只对卡片关闭钮做坐标点击。
#
# 行为约定：best-effort、非致命（失败不阻断套件）；stderr 打日志，stdout 只输出最终 JSON。
#
# 环境变量：
#   E2E_QR_CLOSE_XY    关闭钮屏幕坐标（默认 1162:152，卡片右上角 X）
#   E2E_QR_APPEAR      判定「卡片出现」的区域平均亮度阈值（默认 120，亮色卡片）
#   E2E_QR_WAIT_MAX    等待卡片出现的总秒数上限（默认 90）
#   E2E_QR_POLL        轮询间隔秒（默认 2）
#   E2E_QR_RETRY       点击后若未关闭，重试点击次数（默认 3）
#   E2E_QR_SHOT_DIR    点击前后截图目录（默认不存；CI 设 e2e/artifacts/qr-shots）
#   E2E_QR_DRYRUN=1    只检测不点击（安全摸卡片出现时机）
import json
import os
import sys
import time

# python-xlib get_image 签名：(x, y, width, height, format, plane_mask)
# format=2(ZPixmap)、plane_mask=0xffffffff(全部颜色平面)。缺 plane_mask 会抛 TypeError。
_IMG_FORMAT = 2          # ZPixmap
_IMG_PLANE_MASK = 0xffffffff

REGION = (1005, 135, 1185, 315)
DEFAULT_CLOSE_XY = (1162, 152)
DEFAULT_APPEAR = 120
DEFAULT_WAIT_MAX = 180
DEFAULT_POLL = 2.0
DEFAULT_RETRY = 3


def log(*a):
    print('[close-qr]', *a, file=sys.stderr, flush=True)


def get_display():
    return os.environ.get('WDT_DISPLAY', ':97')


def parse_xy():
    v = os.environ.get('E2E_QR_CLOSE_XY')
    if v and ':' in v:
        try:
            x, y = v.split(':')
            return (int(x), int(y))
        except Exception:
            log('E2E_QR_CLOSE_XY 无效，用默认：', v)
    return DEFAULT_CLOSE_XY


def region_brightness(d, root, box=REGION):
    x0, y0, x1, y1 = box
    try:
        raw = root.get_image(x0, y0, x1 - x0, y1 - y0, _IMG_FORMAT, _IMG_PLANE_MASK)
        data = raw.data
        if not data:
            return -1
        bpp = getattr(raw, 'bits_per_pixel', 32) or 32
        nbytes = bpp // 8
        step = max(nbytes, 1)
        total = 0.0
        n = 0
        # 每像素取 RGB 三通道求和；bpp=32 时含 1 字节 alpha 填充，跳 step 读前 3 字节
        for i in range(0, len(data) - step, step):
            if i + 2 >= len(data):
                break
            r = data[i + 2]
            g = data[i + 1]
            b = data[i]
            total += (r + g + b) / 3.0
            n += 1
        return total / n if n else -1
    except Exception as e:
        log('采样亮度失败：', e)
        return -1


def save_shot(d, root, path, w=1280, h=800):
    try:
        raw = root.get_image(0, 0, w, h, _IMG_FORMAT, _IMG_PLANE_MASK)
        data = raw.data
        bpp = getattr(raw, 'bits_per_pixel', 32) or 32
        stride = getattr(raw, 'bytes_per_line', w * (bpp // 8)) or w * (bpp // 8)
        nbytes = bpp // 8
        with open(path, 'wb') as f:
            f.write(b'P6\n%d %d\n255\n' % (w, h))
            # 逐行拷贝 RGB（去掉可能的行填充），P6 每像素 3 字节
            for row in range(h):
                base = row * stride
                for col in range(w):
                    off = base + col * nbytes
                    if off + 2 >= len(data):
                        break
                    f.write(bytes((data[off + 2], data[off + 1], data[off])))
        log('已存截图：', path)
        return path
    except Exception as e:
        log('存截图失败：', e)
        return None


def click_xy(d, x, y):
    from Xlib import X
    from Xlib.ext import xtest
    root = d.screen().root
    root.warp_pointer(x, y)
    d.sync()
    time.sleep(0.15)
    xtest.fake_input(d, X.ButtonPress, 1)
    d.sync()
    time.sleep(0.08)
    xtest.fake_input(d, X.ButtonRelease, 1)
    d.sync()
    log('已点击 (%d,%d)' % (x, y))


def press_escape(d):
    from Xlib import X, XK
    from Xlib.ext import xtest
    kc = d.keysym_to_keycode(XK.XK_Escape)
    if not kc:
        log('未映射 Escape 键码，跳过 Esc')
        return
    xtest.fake_input(d, X.KeyPress, kc)
    d.sync()
    time.sleep(0.08)
    xtest.fake_input(d, X.KeyRelease, kc)
    d.sync()
    log('已发送 Esc')


def main():
    ok = False
    closed = False
    detail = []
    try:
        from Xlib import display as xdisplay
        d = xdisplay.Display(get_display())
        root = d.screen().root

        appear = float(os.environ.get('E2E_QR_APPEAR', DEFAULT_APPEAR))
        wait_max = float(os.environ.get('E2E_QR_WAIT_MAX', DEFAULT_WAIT_MAX))
        poll = float(os.environ.get('E2E_QR_POLL', DEFAULT_POLL))
        retry = int(os.environ.get('E2E_QR_RETRY', DEFAULT_RETRY))
        shot_dir = os.environ.get('E2E_QR_SHOT_DIR')
        dryrun = os.environ.get('E2E_QR_DRYRUN') == '1'
        if shot_dir:
            os.makedirs(shot_dir, exist_ok=True)

        # 1) 轮询等卡片出现（区域亮度升到 threshold=亮色卡片）
        t0 = time.time()
        base_bright = region_brightness(d, root)
        log('初始卡片区域亮度=%.1f' % base_bright)
        appeared = False
        cur = base_bright
        while time.time() - t0 < wait_max:
            cur = region_brightness(d, root)
            if cur >= appear:
                appeared = True
                break
            time.sleep(poll)
        log('等待 %.1fs → 卡片%s（区域亮度=%.1f，阈值=%.0f）' % (
            time.time() - t0, '已出现' if appeared else '未出现', cur, appear))

        if dryrun:
            ok = True
            detail.append('dryrun（未点击），卡片出现=%s' % appeared)
            if shot_dir:
                save_shot(d, root, os.path.join(shot_dir, 'qr.dryrun.ppm'))
            print(json.dumps({'ok': True, 'closed': False,
                              'detail': ' | '.join(detail), 'appeared': appeared}))
            return

        if not appeared:
            ok = True
            detail.append('90s 内卡片未出现（可能本轮未弹，无需关闭）')
            print(json.dumps({'ok': True, 'closed': False, 'detail': ' | '.join(detail)}))
            return

        x, y = parse_xy()
        if shot_dir:
            save_shot(d, root, os.path.join(shot_dir, 'qr-before.ppm'))
        before = region_brightness(d, root)
        log('卡片出现，开始关闭：点击前亮度=%.1f，默认钮=(%d,%d)' % (before, x, y))

        # 关闭策略（每招后用亮度判定，成功即停）：Esc → 点击候选关闭位(含默认钮+邻近点)。
        # 候选：默认钮、其右、其上、再向右下，覆盖卡片右上角一带可能的 X 位置。
        attempts = [('esc', None)]
        for dx, dy in [(0, 0), (10, 0), (0, -10), (20, 8), (-30, 4)]:
            attempts.append(('click', (x + dx, y + dy)))

        closed = False
        for i, (kind, pt) in enumerate(attempts):
            if kind == 'esc':
                press_escape(d)
                log('Esc 后亮度=%.1f' % region_brightness(d, root))
            else:
                click_xy(d, pt[0], pt[1])
                log('点击 %s 后亮度=%.1f' % (pt, region_brightness(d, root)))
            time.sleep(0.7)
            after = region_brightness(d, root)
            if after < before - 15:
                closed = True
                detail.append('第%d招(%s%s)关闭成功（亮度 %.1f→%.1f）' % (
                    i + 1, kind, (' ' + str(pt)) if pt else '', before, after))
                break
        if not closed:
            detail.append('全部策略后亮度未明显下降（%.1f→%.1f），浮层可能无对应关闭钮' % (
                before, region_brightness(d, root)))

        if shot_dir:
            save_shot(d, root, os.path.join(shot_dir, 'qr-after.ppm'))
        ok = True
    except Exception as e:
        detail.append('异常: %s' % e)
        log(detail[-1])

    print(json.dumps({'ok': ok, 'closed': closed, 'detail': ' | '.join(detail)}))


if __name__ == '__main__':
    main()
