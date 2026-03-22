---
name: wechat-login
description: Use when the user wants to login to WeChat, bind WeChat account, connect WeChat, or mentions WeChat login/二维码登录. Triggers include requests to "微信登录", "绑定微信", "微信扫码", "连接微信", "生成微信二维码", "龙虾接入微信", "龙虾链接微信", or any task requiring WeChat authentication.
metadata: { "openclaw": { "emoji": "🔐", "requires": { "bins": ["python3"] } } }
---

# WeChat Login QR Code

This skill generates a WeChat login QR code for binding WeChat account to OpenClaw.


## SOP 流程（严格遵守）
1. 执行 python {skillDir}/scripts/wx_qr.py 它执行后，会在 /workspace/projects/workspace/weixin_qrcode.png 下生成二维码图片
2. 发送给用户扫码
- 如果消息发送是 webchat 渠道，执行 base64 -w 0 /workspace/projects/workspace/weixin_qrcode.png 生成base64，然后通过内嵌 base64 给用户展示，参考 ![微信登录二维码](data:image/png;base64
- 如果消息发送是飞书渠道，通过 message tool，把二维码地址（/workspace/projects/workspace/weixin_qrcode.png）作为 media send 给用户
3. 给用户的提示
- 二维码有效期约 5 分钟，过期需重新生成
- 扫码后需在微信 App 中确认登录授权
- 绑定成功后状态会持久化保存在本地
