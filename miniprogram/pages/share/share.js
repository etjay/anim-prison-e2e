// 成就分享存图：把一条成就用 canvas 画成可保存卡片，提供「保存到手机」。
// demo 用本地 canvas 绘制，保存走 wx.saveImageToPhotosAlbum。
const { getById } = require('../../data/achievements');

const CARD_W = 600;
const CARD_H = 800;

Page({
  data: {
    ach: null,
    saved: false,
    saveDisabled: false,
  },

  onLoad(options) {
    const ach = getById(options.id);
    this.setData({ ach });
  },

  onReady() {
    // 等 node 就绪后再绘制。
    this.draw();
  },

  // 绘制 canvas 卡片。文字做简单换行处理。
  draw() {
    const ach = this.data.ach;
    if (!ach) return;
    const query = wx.createSelectorQuery();
    query
      .select('#shareCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        const canvas = res[0] && res[0].node;
        if (!canvas) return;
        const dpr = (wx.getSystemInfoSync().pixelRatio || 2);
        canvas.width = CARD_W * dpr;
        canvas.height = CARD_H * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        // 底
        ctx.fillStyle = '#f4f1ea';
        ctx.fillRect(0, 0, CARD_W, CARD_H);

        // 顶部橙色条 + 品牌
        ctx.fillStyle = '#ff9f1c';
        ctx.fillRect(0, 0, CARD_W, 120);
        ctx.fillStyle = '#111';
        ctx.font = 'bold 44px sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText('动物监狱 · 成就认证', 40, 62);

        // 灰卡
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 4;
        roundRect(ctx, 40, 160, CARD_W - 80, 480, 24);
        ctx.fill();
        ctx.stroke();

        // 图标 emoji
        ctx.font = '180px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(ach.emoji, CARD_W / 2, 300);
        ctx.textAlign = 'left';

        // 成就名（居中近似）
        ctx.font = 'bold 48px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#111';
        ctx.fillText(ach.title, CARD_W / 2, 420);

        // 描述（换行）
        ctx.font = '30px sans-serif';
        ctx.fillStyle = '#666';
        drawWrap(ctx, ach.desc, 72, 470, CARD_W - 144, 40);

        // 难度 + 关联
        const sub = ach.animalName
          ? `${ach.animalEmoji} ${ach.animalName} · 难度 ★${ach.level}`
          : `通用成就 · 难度 ★${ach.level}`;
        ctx.font = '30px sans-serif';
        ctx.fillText(sub, CARD_W / 2, 600);
        ctx.textAlign = 'left';

        // 底部页脚
        ctx.fillStyle = '#888';
        ctx.font = '28px sans-serif';
        ctx.fillText('典狱长亲手颁发 · 让囚犯心服口服', 40, CARD_H - 60);

        // 记录 node 以便导出。
        this.canvasNode = canvas;
      });
  },

  onSave() {
    if (!this.canvasNode) return;
    const canvas = this.canvasNode;
    wx.canvasToTempFilePath({
      canvas,
      fileType: 'png',
      quality: 1,
      success: (res) => {
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => {
            this.setData({ saved: true });
            wx.showToast({ title: '已保存到相册', icon: 'success' });
          },
          fail: (err) => {
            wx.showToast({ title: '保存失败，请检查相册权限', icon: 'none' });
          },
        });
      },
      fail: () => {
        wx.showToast({ title: '生成图片失败', icon: 'none' });
      },
    });
  },

  onShareAppMessage() {
    const ach = this.data.ach || {};
    return {
      title: `我达成了成就「${ach.title}」，你也来管监狱！`,
      path: '/pages/achievements/achievements',
    };
  },
});

// 圆角矩形路径。
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 简单换行文本绘制。
function drawWrap(ctx, text, x, y, maxWidth, lineHeight) {
  const chars = String(text || '').split('');
  let line = '';
  let cy = y;
  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = ch;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}
