#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# close-qr — 关闭开发者工具启动后弹出的登录/授权/二维码浮层窗口（ANIM-25）。
#
# 背景：DevTools（nw/Chromium）未登录时冷启会在预览区上弹登录/授权浮层，遮挡小程序界面。
#       自动化（automator/CLI）无关闭该浮层的 API；故用 python-xlib 直接对 X :97 上的窗口
#       做诊断 + 关闭（WM_DELETE_WINDOW 协议 / 鼠标点击右上角关闭钮兜底）。
#       本地无法起 DevTools，本轮先做「窗口树诊断 + 温和关闭」，把实际窗口标题/类名/pid
#       打出来（CI 日志可见），供下一轮精准定位。
#
# 用法：DISPLAY=:97 python3 close-qr.py [--close|--diag]
#   --close   诊断并尝试关闭登录相关窗口（默认）
#   --diag    只列出窗口树，不关闭（安全模式，先摸清结构）
#
# 行为约定：任何异常都不抛、不阻断测试（录屏清除是 best-effort，失败不 fail suite）。
# 输出：JSON 到 stdout，供 Node 侧 parent 读取判定。

import json
import os
import sys

LINE = '=' * 60

def log(*a):
    print('[close-qr]', *a, flush=True)

def get_display():
    return os.environ.get('WDT_DISPLAY', ':97')

def main():
    mode = 'close'
    for a in sys.argv[1:]:
        if a == '--diag':
            mode = 'diag'
        elif a == '--close':
            mode = 'close'

    try:
        from Xlib import display as xdisplay, X, protocol
        from Xlib.error import XError
    except Exception as e:
        log('python-xlib 不可用：', e)
        print(json.dumps({'ok': False, 'error': 'no-xlib'}))
        return

    try:
        d = xdisplay.Display(get_display())
    except Exception as e:
        log('连接显示失败：', e)
        print(json.dumps({'ok': False, 'error': 'display'}))
        return

    root = d.screen().root

    def wm_name(w):
        try:
            return w.get_wm_name()
        except Exception:
            return None

    def wm_class(w):
        try:
            r = w.get_wm_class()
            return list(r) if r else None
        except Exception:
            return None

    def wm_pid(w):
        try:
            prop = w.get_full_property(d.intern_atom('_NET_WM_PID'), X.AnyPropertyType)
            if prop and prop.value:
                return int(prop.value)
        except Exception:
            pass
        return None

    KW = ['登录', 'login', '授权', 'author', '二维码', 'qr', '扫一扫', 'scan', 'wechat', '微信']

    found = []          # 全部顶层窗口（诊断用）
    candidates = []     # 命中登录关键词的窗口（待关闭）
    seq = 0

    def walk(w, depth=0):
        nonlocal seq
        try:
            children = w.query_tree().children
        except Exception:
            return
        for c in children:
            seq += 1
            title = wm_name(c)
            cls = wm_class(c)
            pid = wm_pid(c)
            rec = {
                'seq': seq, 'depth': depth, 'id': hex(c.id),
                'title': title, 'class': cls, 'pid': pid,
            }
            joined = ' '.join([str(title or ''), str(cls or '')]).lower()
            if any(k in joined for k in KW):
                rec['hit'] = KW[:]
                candidates.append(rec)
            found.append(rec)
            walk(c, depth + 1)

    try:
        walk(root)
    except Exception as e:
        log('窗口遍历异常（继续）：', e)

    log('窗口树上共 %d 个窗口，登录相关命中 %d 个' % (len(found), len(candidates)))
    for rec in found:
        log('  depth=%d id=%s title=%r class=%s pid=%s' % (
            rec['depth'], rec['id'], rec.get('title'), rec.get('class'), rec.get('pid')))

    if mode == 'diag':
        print(json.dumps({'ok': True, 'mode': mode, 'count': len(found), 'hit': candidates}))
        return

    # ---- 关闭阶段 ----
    closed = []
    failed = []
    for rec in candidates:
        try:
            w = d.create_resource_object('window', int(rec['id'], 16))
        except Exception as e:
            failed.append({'id': rec['id'], 'error': str(e)})
            continue
        # 办法1：WM_DELETE_WINDOW 协议请求窗口自行关闭
        wm_delete = d.intern_atom('WM_PROTOCOLS')
        wm_del_win = d.intern_atom('WM_DELETE_WINDOW')
        try:
            wm_props = []
            err = w.get_full_property(wm_delete, X.AnyPropertyType)
            if err and err.value:
                wm_props = list(err.value)
            if wm_del_win in wm_props:
                ev = protocol.event.ClientMessage(
                    window=w, client_type=wm_delete,
                    data=(32, [wm_del_win, X.CurrentTime, 0, 0, 0]))
                w.send_event(ev)
                d.flush()
                closed.append({'id': rec['id'], 'method': 'wm_delete', 'title': rec.get('title')})
                log('已请求关闭（wm_delete）：id=%s title=%r' % (rec['id'], rec.get('title')))
                continue
        except Exception as e:
            failed.append({'id': rec['id'], 'step': 'wm_delete', 'error': str(e)})
        # 办法2（默认关闭）：像素点击右上角关闭钮。依赖精确坐标+时序、有误点模拟器风险，
        #   故仅当 E2E_QR_CLICK=1 时启用，否则跳过（record.js 已警告此风险）。
        if os.environ.get('E2E_QR_CLICK') != '1':
            failed.append({'id': rec['id'], 'step': 'click_close', 'error': 'disabled (set E2E_QR_CLICK=1)'})
            continue
        try:
            geo = w.get_geometry()
            x, y = geo.width - 12, 12
            root.warp_pointer(x + geo.x, y + geo.y)
            d.sync()
            # 模拟左键按下/抬起
            from Xlib.ext import xtest
            xtest.fake_input(d, X.ButtonPress, 1)
            d.sync()
            xtest.fake_input(d, X.ButtonRelease, 1)
            d.sync()
            closed.append({'id': rec['id'], 'method': 'click_close', 'title': rec.get('title')})
            log('已点击关闭钮：id=%s title=%r @(%d,%d)' % (rec['id'], rec.get('title'), x, y))
        except Exception as e:
            failed.append({'id': rec['id'], 'step': 'click_close', 'error': str(e)})
            log('关闭失败 id=%s：%s' % (rec['id'], e))

    print(json.dumps({'ok': True, 'mode': mode, 'count': len(found), 'hit': len(candidates),
                      'closed': closed, 'failed': failed}))

if __name__ == '__main__':
    main()
