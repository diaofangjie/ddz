"""在用户截图上标注「密钥对」入口位置"""
from PIL import Image, ImageDraw, ImageFont

SRC = r"C:\Users\DFJ\.workbuddy\clipboard-images\clipboard-2026-09-16T02-56-42-495Z-47a1172a.png"
OUT = r"D:\dfj\dfj\ddz\docs\哪里点密钥对.png"
FONT = r"C:\Windows\Fonts\msyh.ttc"

RED = (214, 48, 49)
BLUE = (24, 95, 165)
GRAY = (95, 94, 90)

im = Image.open(SRC).convert("RGB")
W, H = im.size
d = ImageDraw.Draw(im)

f_big = ImageFont.truetype(FONT, 30)
f_mid = ImageFont.truetype(FONT, 24)
f_small = ImageFont.truetype(FONT, 20)

# 原图中「密钥对」文字位置（由网格测量得出）
KP = (18, 588, 104, 628)

d.rounded_rectangle(KP, radius=6, outline=RED, width=4)

# 标注文字放在右侧空白区
d.line([(KP[2] + 4, (KP[1] + KP[3]) // 2), (250, (KP[1] + KP[3]) // 2)], fill=RED, width=3)
d.text((258, KP[1] - 6), "点这里 →「密钥对」", font=f_big, fill=RED)

# ---- 右下角放大插图 ----
box = (0, 380, 340, 700)
crop = im.crop(box)
scale = 1.75
crop = crop.resize((int(crop.width * scale), int(crop.height * scale)), Image.LANCZOS)
ix, iy = 1120, 380
im.paste(crop, (ix, iy))
d.rectangle([ix - 2, iy - 2, ix + crop.width + 1, iy + crop.height + 1], outline=GRAY, width=2)
d.text((ix + 4, iy - 34), "放大看：左侧菜单", font=f_mid, fill=GRAY)

# 插图内再标一次
k2 = (ix + int((KP[0] - box[0]) * scale) - 4, iy + int((KP[1] - box[1]) * scale) - 4,
      ix + int((KP[2] - box[0]) * scale) + 4, iy + int((KP[3] - box[1]) * scale) + 4)
d.rounded_rectangle(k2, radius=5, outline=RED, width=3)

# 连接线
d.line([(KP[2] + 4, (KP[1] + KP[3]) // 2), (ix - 40, (KP[1] + KP[3]) // 2)], fill=(205, 205, 205), width=2)

# 底部提示（放在表格空白区，避开左侧菜单）
d.text((300, H - 150), "说明：「运维与监控」在左侧菜单更下方，需要往下滚动才可见。", font=f_mid, fill=BLUE)
d.text((300, H - 112), "但走「密钥对」这条路线同样可以，而且它就在眼前。", font=f_mid, fill=BLUE)
d.text((300, H - 74), "点进密钥对页面后，按下面 4 步操作即可。", font=f_mid, fill=BLUE)

im.save(OUT)
print("已保存:", OUT, im.size)
