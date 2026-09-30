from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]
master=Image.open(root/'assets/brand/papery-master-square.png').convert('RGBA')
for size in (32,64,128,256,512):
    master.resize((size,size),Image.Resampling.LANCZOS).save(root/f'public/brand/papery-{size}.png')
# Include native resolutions used by Windows display scaling, not only 16/32.
master.save(root/'src-tauri/icons/icon.ico',format='ICO',sizes=[(n,n) for n in (16,20,24,32,40,48,64,128,256)])
(root/'public/favicon.ico').write_bytes((root/'src-tauri/icons/icon.ico').read_bytes())
print('Master:',master.size,'ICO frames: 16,20,24,32,40,48,64,128,256')
