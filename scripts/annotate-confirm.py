"""标注绑定密钥对确认弹窗（原图坐标，已用网格精确测量）"""
from PIL import Image, ImageDraw, ImageFont

SRC = r"C:\Users\DFJ\.workbuddy\clipboard-images\clipboard-2026-09-16T03-05-20-308Z-defd58f8.png"
OUT = r"D:\dfj\dfj\ddz\docs\绑定密钥对确认要点.png"
FONT = r"C:\Windows\Fonts\msyh.ttc"

RED = (214, 48, 49)
AMBER = (186, 117, 23)
BLUE = (24, 95, 165)

im = Image.open(SRC).convert("RGB")
d = ImageDraw.Draw(im)
f_title = ImageFont.truetype(FONT, 30)
f_mid = ImageFont.truetype(FONT, 23)
f_body = ImageFont.truetype(FONT, 21)

# ① 「重启」单选（保持默认，别选强制重启）
d.rounded_rectangle((624, 382, 694, 410), radius=6, outline=AMBER, width=4)
d.line([(696, 396), (806, 396)], fill=AMBER, width=3)
d.text((812, 382), "保持选这个，别选强制重启", font=f_mid, fill=AMBER)

# ② 「确认」按钮
d.rounded_rectangle((1188, 422, 1270, 474), radius=7, outline=RED, width=4)
d.line([(1229, 476), (1229, 512)], fill=RED, width=3)
d.text((1108, 518), "点「确认」", font=f_title, fill=RED)

# ③ 后果说明
d.text((560, 596), "接下来会发生：实例重启，约 30 秒～1 分钟。", font=f_body, fill=BLUE)
d.text((560, 634), "重启会断开正在进行的对局（游戏没做持久化）。", font=f_body, fill=BLUE)
d.text((560, 672), "如果现在没人在打牌，那就没关系，直接点。", font=f_body, fill=BLUE)
d.text((560, 714), "重启完立刻回来跟我说一声，我马上试连，", font=f_body, fill=BLUE)
d.text((560, 744), "并检查后端服务有没有自动拉起来。", font=f_body, fill=BLUE)

im.save(OUT)
print("已保存:", OUT, im.size)
