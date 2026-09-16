---
title: Canvas 不规则区域命中检测笔记
description: 从透明像素、坐标换算到拖拽取消，整理 Canvas 点命中检测的实现边界。
date: 2026-09-16 10:02
category: 前端实战
tags:
  - Canvas
  - 交互
  - 学习笔记
aside: true
comment: false
---

# Canvas 不规则区域命中检测笔记

> 参考 Niuhk 的 [基于 canvas getImageData 函数的图片碰撞检测](https://niuhk.cn/2025/01/21/基于canvas%20getImageData函数的图片碰撞检测/)，用独立示例整理坐标转换、透明度判断和交互边界。

相关笔记：[H5 海报生成](../h5/poster-generation.md) · [H5 性能优化](../performance/h5-performance.md)

## 1. 先定义“碰到”的含义

矩形按钮通常用边界框即可。不规则贴纸、地图区域或拼图，可以根据目标图片的透明像素判断一个点是否命中。

本文实现的是**点与目标非透明区域的命中检测**。若要求两张图片只要有一个像素重叠就算碰撞，需要进一步计算重叠区域，并比较双方的透明度；只检查拖拽图片中心点不能代替完整碰撞检测。

## 2. 缓存目标区域，移动时只查一个像素

以下函数接收已经绘制完目标图形的 Canvas，创建可重复调用的命中判断器。示例使用默认的 8 位 RGBA 像素数据，alpha 范围为 0～255。

```ts
function createHitTester(canvas: HTMLCanvasElement, alphaThreshold = 16) {
  if (!Number.isInteger(alphaThreshold) || alphaThreshold < 1 || alphaThreshold > 255) {
    throw new RangeError('透明度阈值必须是 1～255 的整数');
  }
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('无法获取 Canvas 上下文');
  const width = canvas.width;
  const height = canvas.height;
  if (width === 0 || height === 0) throw new Error('Canvas 尺寸不能为空');
  const { data } = context.getImageData(0, 0, width, height);

  return (clientX: number, clientY: number): boolean => {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const x = Math.floor((clientX - rect.left) * width / rect.width);
    const y = Math.floor((clientY - rect.top) * height / rect.height);
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return data[(y * width + x) * 4 + 3] >= alphaThreshold;
  };
}
```

调用时传入 PointerEvent 的 `clientX`、`clientY`。它们与 `getBoundingClientRect()` 都使用视口坐标，不要混入 `pageX` 或再次加页面滚动距离。

这里要求 Canvas 没有 border、padding，也没有旋转或倾斜。普通轴向 CSS 缩放和画布像素尺寸与显示尺寸不一致的情况，已通过比例处理。复杂变换需要逆变换矩阵；图片采用 `object-fit: contain` 留白时，还需扣除实际绘制区域的偏移。

### 为什么不直接判断 alpha === 255？

抗锯齿边缘、阴影、半透明图案可能不是完全不透明。阈值是产品规则：16 比较宽松，128 更接近主体轮廓。值越小，越容易把淡阴影算进区域；应结合素材测试。

### 缓存什么时候失效？

目标重新绘制、分辨率改变或更换图片后，要重新创建判断器。只改变显示大小时，函数会在每次调用时读取新矩形。不要在每次 `pointermove` 中读取整张图的像素。

建议将静态目标和动态拖拽图层分开，避免把正在拖拽的物体也读进目标掩码。大画布的 RGBA 缓存约占 `宽 × 高 × 4` 字节，多个副本会继续增加内存。

## 3. 拖拽流程要覆盖取消状态

| 事件 | 建议行为 |
| --- | --- |
| pointerdown | 记录起点和最后一个有效位置，调用 setPointerCapture |
| pointermove | 换算拖拽物体的检测点，判断是否合法并更新预览 |
| pointerup | 合法则提交，不合法则恢复最后有效位置 |
| pointercancel / lostpointercapture | 清理拖拽状态，避免按钮或贴纸一直处于拖动中 |

如果检测的是拖拽物体中心点，应根据物体当前位置计算中心，再转为视口坐标；直接用鼠标位置会让“按住边缘”和“按住中心”的结果不一致。

手势区域可按需求设置 `touch-action`。只有确实需要完全接管触摸时才使用 `none`，否则会影响页面滚动。键盘和可点击替代操作也应单独设计。

## 4. 跨域图像与异常处理

跨域图片被绘制到画布后，若未满足 CORS 条件，读取像素会抛出 `SecurityError`。给图片设置 `crossOrigin = 'anonymous'` 还需要图片服务器返回允许访问的响应头，而且应在设置 `src` 前完成。

可以在初始化命中判断器时捕获异常，展示明确错误或切换到预先制作的同源掩码。降级成矩形命中会改变交互规则，不能悄悄当成精确检测成功。

## 5. 上线前自检

- 全透明区域返回 false，半透明区域符合设定阈值。
- 左上角、右下边界、负坐标和画布外的位置不越界。
- CSS 缩放、页面滚动、高像素密度屏幕下命中位置一致。
- 换图和调整画布尺寸后重新生成掩码。
- 手指移出区域、系统中断手势后，状态能恢复。
- 对“中心点命中”和“整张图碰撞”的需求没有混淆。

## 参考资料

- [MDN：getImageData](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/getImageData)
- [MDN：getBoundingClientRect](https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect)
- [MDN：Pointer events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)
- [MDN：跨域图像与 Canvas](https://developer.mozilla.org/en-US/docs/Web/HTML/How_to/CORS_enabled_image)
