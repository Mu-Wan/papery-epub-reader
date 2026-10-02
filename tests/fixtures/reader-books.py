"""Original, small multi-chapter documents for the reader regression checks."""
from pathlib import Path
import base64, io, json, zipfile

root = Path(__file__).resolve().parents[2]
folder = root / 'output/ui-0.1.28'
folder.mkdir(parents=True, exist_ok=True)
buffer = io.BytesIO()
with zipfile.ZipFile(buffer, 'w') as archive:
    archive.writestr('mimetype', 'application/epub+zip', compress_type=zipfile.ZIP_STORED)
    archive.writestr('META-INF/container.xml', '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
    manifest = '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
    spine = ''
    navigation = ''
    for chapter in range(1, 13):
        manifest += f'<item id="c{chapter}" href="chapter{chapter}.xhtml" media-type="application/xhtml+xml"/>'
        spine += f'<itemref idref="c{chapter}"/>'
        navigation += f'<li><a href="chapter{chapter}.xhtml">第 {chapter} 章 河岸记录</a></li>'
        paragraphs = ''.join(f'<p>第{chapter}章第{index}段。清晨沿着河岸慢慢走，树影落在水面，微风把这一页轻轻翻过。我们把今天看见的光写在纸上，留下完整的一段话。检索标记-{chapter}-{index}。不急着抵达，阅读也有自己的节奏。</p>' for index in range(1, 36))
        # Widths and columns left by publisher CSS must not clip scrolling text.
        css = 'body{width:50%;height:100vh;overflow:auto}main{width:50%}p{margin-top:0}' if chapter == 3 else 'body{margin:0}p{margin-top:0}'
        archive.writestr(f'chapter{chapter}.xhtml', f'<html xmlns="http://www.w3.org/1999/xhtml" lang="zh"><head><title>第 {chapter} 章</title><style>{css}</style></head><body><main><h1>第 {chapter} 章 河岸记录</h1>{paragraphs}</main></body></html>', compress_type=zipfile.ZIP_DEFLATED)
    archive.writestr('content.opf', '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">papery-original-reader-check</dc:identifier><dc:title>阅读核心核查</dc:title><dc:creator>原创测试文档</dc:creator><dc:language>zh</dc:language></metadata><manifest>'+manifest+'</manifest><spine>'+spine+'</spine></package>', compress_type=zipfile.ZIP_DEFLATED)
    archive.writestr('nav.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>目录</title></head><body><nav epub:type="toc"><ol>'+navigation+'</ol></nav></body></html>', compress_type=zipfile.ZIP_DEFLATED)
fixture = {'epub': base64.b64encode(buffer.getvalue()).decode()}
text='\n'.join(f'第{chapter}章 河岸记录\n'+('\n'.join(f'记录第{chapter}章第{i}段。清晨沿着河岸慢慢走，树影落在水面。检索标记-{chapter}-{i}。'+('阅读也有自己的节奏。'*12) for i in range(1,25))) for chapter in range(1,13))
fixture['txt']=base64.b64encode(text.encode()).decode()
(folder/'阅读核心核查.txt').write_text(text,encoding='utf-8')
# Small standard PDF with portrait, landscape and square pages, independent of fonts.
objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>']
for page,(width,height) in enumerate([(500,750),(750,500),(600,600)]):
    stream=f'BT /F1 24 Tf 60 {height-80} Td (Original reading check - page {page+1}) Tj ET'.encode()
    objects.append(f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {width} {height}] /Resources << /Font << /F1 9 0 R >> >> /Contents {4+page*2} 0 R >>'.encode())
    objects.append(b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream')
objects.append(b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
pdf=b'%PDF-1.4\n';offsets=[0]
for index,obj in enumerate(objects,1):offsets.append(len(pdf));pdf+=str(index).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
xref=len(pdf);pdf+=b'xref\n0 10\n0000000000 65535 f \n'+b''.join(f'{offset:010} 00000 n \n'.encode() for offset in offsets[1:])+f'trailer\n<< /Size 10 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF'.encode()
fixture['pdf']=base64.b64encode(pdf).decode();(folder/'阅读核心核查.pdf').write_bytes(pdf)
(folder / 'reader-fixtures.json').write_text(json.dumps(fixture), encoding='utf-8')
(folder / '阅读核心核查.epub').write_bytes(buffer.getvalue())
print('Created original 12-chapter EPUB fixture.')
