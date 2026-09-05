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
        raw = root.get_image(x0, y0, x1 - x0, y1 - y0, 0xffffffff)
        data = raw.data
        if not data:
            return -1
        step = 4
        total = 0.0
        n = 0
        for i in range(0, len(data) - 3, step):
            b = data[i]
            g = data[i + 1]
            r = data[i + 2]
            total += (r + g + b) / 3.0
            n += 1
        return total / n if n else -1
    except Exception as e:
        log('采样亮度失败：', e)
        return -1


def save_shot(d, root, path, w=1280, h=800):
    try:
        raw = root.get_image(0, 0, w, h, 0xffffffff)
        with open(path, 'wb') as f:
            f.write(b'P6\n%d %d\n255\n' % (w, h))
            f.write(raw.data)
        log('已存截图：', path)
        return path
    except Exception as e:
        log('存截图失败：', e)
        return None


def click_xy(d, x, y):
    from Xlib.ext import xtest
    root = d.screen().root
    root.warp_pointer(x, y)
    d.sync()
    time.sleep(0.15)
    xtest.fake_input(d, 1, 1)
    d.sync()
    time.sleep(0.08)
    xtest.fake_input(d, 1, 0)
    d.sync()
    log('已点击 (%d,%d)' % (x, y))


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
        log('卡片出现，点击关闭钮 (%d,%d)，点击前亮度=%.1f' % (x, y, before))

        # 2) 点击并确认（亮度显著下降=关掉）
        for attempt in range(1, retry + 1):
            click_xy(d, x, y)
            time.sleep(0.8)
            after = region_brightness(d, root)
            log('第 %d 次点击后亮度=%.1f' % (attempt, after))
            if after < before - 15:
                closed = True
                detail.append('第%d次点击后关闭成功（亮度 %.1f→%.1f）' % (attempt, before, after))
                break
            # 微调坐标右移下移再试（关闭钮可能略偏）
            x += 6
            y += 6
        if not closed:
            detail.append('点击 %d 次后亮度未明显下降（%.1f→%.1f），卡片可能未识别到关闭钮' % (
                retry, before, region_brightness(d, root)))

        if shot_dir:
            save_shot(d, root, os.path.join(shot_dir, 'qr-after.ppm'))
        ok = True
    except Exception as e:
        detail.append('异常: %s' % e)
        log(detail[-1])

    print(json.dumps({'ok': ok, 'closed': closed, 'detail': ' | '.join(detail)}))


if __name__ == '__main__':
    main()
