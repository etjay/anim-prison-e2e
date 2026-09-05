#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# close-qr（ANIM-25，v2）—— 关闭模拟器右上角弹出的「预览二维码」悬浮卡片。
#
# 背景（v1 教训）：登录浮窗不是独立系统窗口，而是 DevTools 模拟器内部由 redux
#   WINDOW_SET_PREVIEW_COMPONENT 弹出的 in-simulator 卡片（1280×800 布局下约 x1005-1185,
#   y135-315）。v1 用 X 窗口管理去 close 会把整个 DevTools 主窗口关掉 → 全黑屏、测试全挂。
#   故 v2 彻底改为「坐标点击卡片关闭钮」，且绝不操作主窗口/根窗口的关闭。
#
# 目标窗口确认（只用来定位、绝不低于关闭）：我们在窗口中仅读取几何与名称，确认
# DevTools 已就绪；关闭动作只作用于卡片上的关闭钮相对坐标（root 屏幕坐标）。
#
# 行为约定：
#   - best-effort、非致命：失败只打日志，不影响测试套件（与 record.js 一致）。
#   - 日志全部走 stderr；stdout 只输出最终 JSON（给 Node 父进程解析）。
#   - 默认坐标点击（xtest 鼠标左键）；可用 E2E_QR_CLOSE_XY=x:y 覆盖关闭钮屏幕坐标。
#
# 用法：DISPLAY=:97 python3 close-qr.py
#   E2E_QR_CLOSE_XY  关闭钮屏幕坐标（默认 1162:152，卡片右上角 X）
#   E2E_QR_DELAY      等卡片弹出的秒数（默认 6，先等首屏编译热缓存、卡片出现）
#   E2E_QR_SHOT_DIR   把点击前后截图存到该目录（默认不存；CI 可设 e2e/artifacts 供回看）
#   E2E_QR_DRYRUN=1   只截图不点击（安全摸卡片位置）
import json
import os
import sys
import time
import struct

DEFAULT_CLOSE_XY = (1162, 152)   # 卡片右上角关闭钮（卡片区域 x1005-1185, y135-315）
DEFAULT_DELAY = 6.0


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


def region_brightness(d, root, x0=1005, y0=135, x1=1185, y1=315):
    """对卡片区域采一点像素算平均亮度，粗略判断卡片(亮)是否还在。"""
    try:
        raw = root.get_image(x0, y0, x1 - x0, y1 - y0, 0xffffffff)
        data = raw.data
        if not data:
            return -1
        # 每像素取 RGB 前若干字节求和取平均
        step = 4  # 假定 32bpp；采样间隔降开销
        vals = []
        for i in range(0, len(data), step):
            b = data[i]
            g = data[i + 1] if i + 1 < len(data) else 0
            r = data[i + 2] if i + 2 < len(data) else 0
            vals.append((r + g + b) / 3.0)
        return sum(vals) / len(vals) if vals else -1
    except Exception as e:
        log('采样亮度失败（跳过）：', e)
        return -1


def save_shot(d, root, path, w=1280, h=800):
    try:
        raw = root.get_image(0, 0, w, h, 0xffffffff)
        data = raw.data
        # 转 PPM（P6）再交给 ffmpeg/convert 或直接丢 png 需要 PIL；这里落 PPM，CI 上可读。
        with open(path, 'wb') as f:
            f.write(b'P6\n%d %d\n255\n' % (w, h))
            f.write(data)
        log('已存截图：', path)
        return path
    except Exception as e:
        log('存截图失败：', e)
        return None


def click_xy(d, root, x, y):
    from Xlib.ext import xtest
    root.warp_pointer(x, y)
    d.sync()
    time.sleep(0.15)
    xtest.fake_input(d, 1, 1)   # ButtonPress
    d.sync()
    time.sleep(0.08)
    xtest.fake_input(d, 1, 0)   # ButtonRelease
    d.sync()


def find_devtools_window(d, root):
    """返回 DevTools 主窗口（class wechat-devtools），只用于确认就绪，绝不关闭。"""
    try:
        def walk(w):
            for c in w.query_tree().children:
                try:
                    cls = c.get_wm_class()
                    if cls and 'wechat-devtools' in cls[0].lower():
                        return c
                except Exception:
                    pass
                r = walk(c)
                if r is not None:
                    return r
            return None
        return walk(root)
    except Exception:
        return None


def main():
    ok = False
    closed = False
    detail = ''
    try:
        from Xlib import display as xdisplay
        d = xdisplay.Display(get_display())
        root = d.screen().root

        dev_win = find_devtools_window(d, root)
        if dev_win is None:
            detail = '未找到 DevTools 主窗口（可能尚未就绪）'
            log(detail)
        else:
            detail = 'DevTools 主窗口就绪'

        delay = float(os.environ.get('E2E_QR_DELAY', DEFAULT_DELAY))
        log('等待 %.1fs 让卡片弹出（E2E_QR_DELAY）...' % delay)
        time.sleep(delay)

        shot_dir = os.environ.get('E2E_QR_SHOT_DIR')
        if shot_dir:
            os.makedirs(shot_dir, exist_ok=True)

        x, y = parse_xy()
        before = region_brightness(d, root)
        log('卡片区域亮度(点击前)=%.1f，关闭钮目标=(%d,%d)' % (before, x, y))
        if shot_dir:
            save_shot(d, root, os.path.join(shot_dir, 'qr-before.ppm'))

        if os.environ.get('E2E_QR_DRYRUN') == '1':
            detail += '（dry-run 未点击）'
        else:
            click_xy(d, root, x, y)
            time.sleep(0.6)
            after = region_brightness(d, root)
            log('卡片区域亮度(点击后)=%.1f' % after)
            if shot_dir:
                save_shot(d, root, os.path.join(shot_dir, 'qr-after.ppm'))
            # 判定：卡片为亮色，区域亮度显著下降 → 判定关闭成功
            if before >= 0 and after >= 0 and after < before - 15:
                closed = True
                detail += ' | 卡片已关闭（亮度下降）'
            else:
                detail += ' | 点击完成（亮度未明显变化，卡片可能未出现/位置需校准）'
        ok = True
    except Exception as e:
        detail = '异常: %s' % e
        log(detail)

    print(json.dumps({'ok': ok, 'closed': closed, 'detail': detail}))


if __name__ == '__main__':
    main()
