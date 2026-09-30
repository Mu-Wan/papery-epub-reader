from pathlib import Path
import json,base64,io,zipfile
root=Path(__file__).resolve().parents[2]
out=root/'output/showcase';out.mkdir(parents=True,exist_ok=True)
titles=['沿河慢行','纸上的远方','城市与清晨','山间来信','微光与日常']
authors=['林溪','许望','陆川','沈青','周禾']
colors=['#C4D0C9','#DDD2C3','#D1DEE8','#DDD4CE','#D5DBC9']
paragraphs=['清晨的河岸还没有醒来。树影落在水里，一阵风过去，便把昨日的心事轻轻翻了页。','走得慢一点，才会看见风把河面吹成不同的颜色。我们常常以为远方需要一张车票，其实有时，只需要把目光从屏幕上移开。','岸边的小店刚开门。老板把一只白瓷杯放到窗下，阳光顺着杯沿滑落，在木桌上留下一圈浅浅的光。','我把这一刻记在纸上：不用急着得到答案，先认真地看一看。那些没有被安排进日程的片刻，也能成为一天里最值得珍藏的部分。','河流从不说明自己的方向。它绕过石头，也接纳雨水，带着沿岸的灯火慢慢向前。傍晚再经过这里时，我想起早晨那阵风，忽然觉得，生活也可以这样继续。']
text='第一章 河岸的早晨\n\n'+'\n\n'.join(paragraphs)+'\n\n第二章 日常的光\n\n'+'\n\n'.join(paragraphs*5)
books=[]
for i,title in enumerate(titles):
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="360"><rect width="240" height="360" fill="{colors[i]}"/><path d="M22 0v360" stroke="#FFFFFF" opacity=".27" stroke-width="2"/><text x="43" y="50" font-family="Georgia,serif" font-size="11" fill="#4F5A53" letter-spacing="2">PAPERY · READING</text><text x="40" y="142" font-family="Microsoft YaHei, sans-serif" font-size="30" font-weight="600" fill="#29332E">{title[:2]}</text><text x="40" y="184" font-family="Microsoft YaHei,sans-serif" font-size="30" font-weight="600" fill="#29332E">{title[2:]}</text><text x="42" y="220" font-family="Microsoft YaHei,sans-serif" font-size="12" fill="#56635A">{authors[i]} / 文</text><path d="M42 281 Q95 264 154 280 T209 280 M42 292 Q106 274 156 293 T210 292" fill="none" stroke="#6B7B71" opacity=".55"/><text x="42" y="332" font-family="Microsoft YaHei,sans-serif" font-size="9" fill="#59685F">把时间留给阅读</text></svg>'
    fmt=['TXT','EPUB','PDF','TXT','EPUB'][i]
    blob=text.encode()
    if fmt=='EPUB':
        buf=io.BytesIO()
        with zipfile.ZipFile(buf,'w') as z:
            z.writestr('mimetype','application/epub+zip',compress_type=zipfile.ZIP_STORED)
            z.writestr('META-INF/container.xml','<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
            z.writestr('cover.svg',svg)
            z.writestr('content.opf',f'<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">papery-demo-{i}</dc:identifier><dc:title>{title}</dc:title><dc:creator>{authors[i]}</dc:creator><dc:language>zh</dc:language><meta property="dcterms:modified">2026-09-30T00:00:00Z</meta></metadata><manifest><item id="cover" href="cover.svg" media-type="image/svg+xml" properties="cover-image"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>')
            z.writestr('nav.xhtml','<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">河岸的早晨</a></li></ol></nav></body></html>')
            z.writestr('chapter.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><head><title>'+title+'</title></head><body><h1>河岸的早晨</h1>'+''.join('<p>'+p+'</p>' for p in paragraphs*5)+'</body></html>')
        blob=buf.getvalue()
    elif fmt=='PDF':
        # Small valid original PDF, kept only in the isolated demonstration book library.
        objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
        stream=b'BT /F1 28 Tf 70 700 Td (CITY AND MORNING) Tj 0 -40 Td /F1 12 Tf (A Papery demonstration document.) Tj ET'
        objects.append(b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream');blob=b'%PDF-1.4\n';offsets=[0]
        for n,obj in enumerate(objects,1):offsets.append(len(blob));blob+=str(n).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
        start=len(blob);blob+=b'xref\n0 6\n0000000000 65535 f \n'+b''.join(f'{x:010} 00000 n \n'.encode() for x in offsets[1:])+b'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+str(start).encode()+b'\n%%EOF\n'
    books.append({'id':f'demo-{i}','title':title,'author':authors[i],'format':fmt,'category':['散文','随笔','未分类','散文','随笔'][i],'progress':[42,18,100,100,6][i],'blobBase64':base64.b64encode(blob).decode(),'coverDataUrl':'data:image/svg+xml;base64,'+base64.b64encode(svg.encode()).decode(),'currentLocation':json.dumps({'type':'txt','offset':0}) if fmt=='TXT' else None})
fixture={'books':books,'text':text,'quotes':paragraphs}
source=Path(__file__).with_name('capture-template.js').read_text(encoding='utf-8')
(out/'capture.js').write_text(source.replace('__FIXTURE__',json.dumps(fixture,ensure_ascii=False)),encoding='utf-8')
