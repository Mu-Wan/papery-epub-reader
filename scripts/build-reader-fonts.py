"""Regenerate offline WenKai shards. Install fonttools and brotli to run this script."""
import argparse, hashlib, json, logging, shutil
from pathlib import Path

parser=argparse.ArgumentParser();parser.add_argument('--deps');args=parser.parse_args()
if args.deps:
    import sys
    sys.path.insert(0,args.deps)
from fontTools import subset
from fontTools.ttLib import TTFont
logging.getLogger('fontTools').setLevel(logging.ERROR)
root=Path(__file__).resolve().parents[1]
source=root/'node_modules/@fontsource/lxgw-wenkai/files/lxgw-wenkai-latin-300-normal.woff2'
output=root/'public/fonts/wenkai';output.mkdir(parents=True,exist_ok=True)
scratch=root/'output/reader-font-build';scratch.mkdir(parents=True,exist_ok=True)
decoded=scratch/'wenkai.ttf'
source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
stamp=scratch/'source-sha256.txt'
if not decoded.exists() or not stamp.exists() or stamp.read_text()!=source_hash:
    with TTFont(source,recalcTimestamp=False) as font:
        font.flavor=None;font.save(decoded)
    print('Decoded source once for all shards.',flush=True)
    stamp.write_text(source_hash)
with TTFont(decoded) as font:
    original=set(font.getBestCmap())
common=set(range(0x0250))|set(range(0x2000,0x2070))|set(range(0x3000,0x3100))|set(range(0xff00,0xfff0))
for lead in range(0xb0,0xd8):
    for trail in range(0xa1,0xff):
        try: common.add(ord(bytes([lead,trail]).decode('gb2312')))
        except UnicodeError: pass
common &= original
groups={'common':common}
for cp in sorted(original-common):groups.setdefault(f'u{cp//2048:03x}',set()).add(cp)
def unicode_ranges(points):
    result=[];start=last=None
    for cp in sorted(points):
        if last is not None and cp==last+1:last=cp;continue
        if last is not None:result.append(f'U+{start:X}'+(f'-{last:X}' if start!=last else ''))
        start=last=cp
    if last is not None:result.append(f'U+{start:X}'+(f'-{last:X}' if start!=last else ''))
    return ','.join(result)
manifest=[];css=[];coverage=set();sizes=0
for name,points in groups.items():
    path=output/f'{name}.woff2'
    options=subset.Options();options.flavor='woff2';options.recalc_timestamp=False
    options.name_IDs=['*'];options.name_legacy=True;options.name_languages=['*'];options.layout_features=['*']
    reusable=False
    previous_proof=output/'coverage.json'
    same_source=previous_proof.exists() and json.loads(previous_proof.read_text(encoding='utf8')).get('sourceSha256')==source_hash
    if same_source and path.exists():
        try:
            with TTFont(path) as font:reusable=set(font.getBestCmap())==points
        except Exception: pass
    if not reusable:
        with TTFont(decoded,recalcTimestamp=False) as font:
            sub=subset.Subsetter(options=options);sub.populate(unicodes=points);sub.subset(font);font.flavor='woff2';font.save(path)
    with TTFont(path) as font: actual=set(font.getBestCmap())
    if actual!=points:raise RuntimeError(f'Glyph coverage differs: {name}')
    if coverage & actual:raise RuntimeError('Overlapping shard coverage')
    coverage|=actual;sizes+=path.stat().st_size
    face={'url':f'/fonts/wenkai/{name}.woff2','range':unicode_ranges(points),'glyphs':len(points),'bytes':path.stat().st_size}
    manifest.append(face)
    css.append('@font-face{font-family:"LXGW WenKai";font-style:normal;font-display:swap;font-weight:300 500;src:url("'+face['url']+'") format("woff2");unicode-range:'+face['range']+'}')
    print(f'{name}: {len(points)} glyphs, {face["bytes"]} bytes',flush=True)
if coverage!=original:raise RuntimeError('Original glyph coverage not preserved')
(root/'app/lib/reader-font-manifest.json').write_text(json.dumps(manifest,separators=(',',':')),encoding='utf8')
(root/'app/reader-fonts.css').write_text('\n'.join(css)+'\n',encoding='utf8')
shutil.copyfile(root/'node_modules/@fontsource/lxgw-wenkai/LICENSE',output/'OFL.txt')
proof={'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'sourceBytes':source.stat().st_size,'glyphs':len(original),'shards':len(manifest),'totalBytes':sizes,'commonBytes':manifest[0]['bytes'],'completeCoverage':True}
(output/'coverage.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8');print(json.dumps(proof),flush=True)
