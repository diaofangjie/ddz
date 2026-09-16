"""在密钥对列表截图上标注「绑定密钥对」按钮位置"""
from PIL import Image, ImageDraw, ImageFont

SRC = r"C:\Users\DFJ\.workbuddy\clipboard-images\clipboard-2026-09-16T03-03-53-366Z-f1aa827d.png"
OUT = r"D:\dfj\dfj\ddz\docs\哪里点绑定密钥对.png"
FONT = r"C:\Windows\Fonts\msyh.ttc"

RED = (214, 48, 49)
BLUE = (24, 95, 165)
GRAY = (140, 140, 140)

im = Image.open(SRC).convert("RGB")
W, H = im.size
print("原图:", (W, H))

# 截图渲染宽度按 1080 估算，换算成原图坐标
s = W / 1080.0


def R(x, y):
    return (int(x * s), int(y * s))


d = ImageDraw.Draw(im)
f_big = ImageFont.truetype(FONT, 28)
f_mid = ImageFont.truetype(FONT, 22)

# 「操作」列这一格
box = (*R(846, 106), *R(942, 134))
d.rounded_rectangle(box, radius=6, outline=RED, width=4)

# 引线 + 标注文字（放到下方空白区）
anchor = R(846, 120)
label = R(600, 178)
d.line([anchor, label], fill=RED, width=3)
d.text(label, "第 1 步：点这里 →「绑定密钥对」", font=f_big, fill=RED)

# 下方步骤说明
d.text(R(150, 232), "第 2 步：弹窗里找到 iZ2vc1qbq6rvmfs8m6t7Z（IP 8.137.195.155），点 > 移到右侧「已选择」", font=f_mid, fill=BLUE)
d.text(R(150, 268), "第 3 步：点「确定」", font=f_mid, fill=BLUE)
d.text(R(150, 304), "第 4 步：如果它要求重启实例，先别重启，回来告诉我 —— 我先试连一次", font=f_mid, fill=(186, 117, 23))

im.save(OUT)
print("已保存:", OUT, im.size)
