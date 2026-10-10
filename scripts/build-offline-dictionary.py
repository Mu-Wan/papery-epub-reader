"""Build a redistributable, compact Chinese dictionary from Chinese Wiktionary.

Input: Kaikki zhwiktionary JSONL, Chinese entries. Definitions retain their source
word for attribution. No quotations, examples, media or pronunciation are bundled.
Output data is CC BY-SA 4.0; the builder is covered by the application's license.
"""
import argparse, json, re, urllib.request, urllib.parse, gzip, pathlib, hashlib
from importlib.metadata import version
from opencc import OpenCC

converter = OpenCC('t2s')
def simplify(text):
    # Some phrase conversions expose another mapping; converge before bundling.
    for _ in range(4):
        converted = converter.convert(text)
        if converted == text:
            return converted
        text = converted
    assert converter.convert(text) == text, 'Simplified conversion did not converge'
    return text

parser = argparse.ArgumentParser()
parser.add_argument('--source', default='output/diagnostics/dictionary-source.jsonl')
args = parser.parse_args()
source = pathlib.Path(args.source)
url = 'https://kaikki.org/zhwiktionary/%E6%BC%A2%E8%AA%9E/kaikki.org-dictionary-%E6%BC%A2%E8%AA%9E.jsonl'
if not source.exists():
    source.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(url, source)
entries = {}
redirects = {}
for line in source.open(encoding='utf-8'):
    item = json.loads(line)
    word = item.get('word', '')
    if not re.fullmatch(r'[\u3400-\u9fff]{1,8}', word):
        continue
    meanings = []
    for sense in item.get('senses', []):
        if sense.get('form_of') or sense.get('alt_of'):
            continue
        for gloss in sense.get('glosses', []):
            gloss = re.sub(r'\s+', ' ', gloss).strip()
            target = re.search(r'(?:請見|请见)「([^」]+)」', gloss)
            if target:
                redirects[word] = target.group(1)
            if re.search(r'NOTITLECONVERT|\{\{|\}\}|Module:|模板:|的發音和釋義|的发音和释义|此字是.+的[簡简繁].?[化體体]字', gloss):
                continue
            if re.search(r'[\u3400-\u9fff]', gloss) and 2 <= len(gloss) <= 240 and gloss not in meanings:
                meanings.append(gloss)
    if not meanings:
        continue
    aliases = [word] + [f.get('form', '') for f in item.get('forms', []) if 'Simplified-Chinese' in f.get('tags', [])]
    for alias in aliases:
        alias = simplify(alias)
        if not re.fullmatch(r'[\u3400-\u9fff]{1,8}', alias):
            continue
        record = entries.setdefault(alias, ['https://zh.wiktionary.org/wiki/' + urllib.parse.quote(word, safe=''), []])
        for gloss in meanings:
            gloss = simplify(gloss)
            if gloss not in record[1] and len(record[1]) < 4:
                record[1].append(gloss)
redirects = {simplify(alias):simplify(target) for alias,target in redirects.items()}
for alias, target in redirects.items():
    if alias in entries:
        continue
    visited = {alias}
    while target not in entries and target in redirects and target not in visited:
        visited.add(target)
        target = redirects[target]
    if target in entries:
        entries[alias] = entries[target]
out = pathlib.Path('public/dictionary/zh-v1')
out.mkdir(parents=True, exist_ok=True)
shards = [{} for _ in range(128)]
for word, record in sorted(entries.items()):
    shards[ord(word[0]) % 128][word] = record
dump = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()
(out / 'index.json').write_bytes(dump(list(sorted(entries))))
for number, shard in enumerate(shards):
    (out / f'{number:02x}.json').write_bytes(dump(shard))
files = [out/'index.json'] + [out/f'{number:02x}.json' for number in range(128)]
with source.open('rb') as original:
    source_hash = hashlib.file_digest(original, 'sha256').hexdigest()
stats = {'version':2, 'language':'zh-Hans', 'traditionalAliases':False, 'conversion':{'tool':'OpenCC','version':version('opencc'),'config':'t2s'}, 'words':len(entries), 'rawBytes':sum(f.stat().st_size for f in files), 'gzipBytes':sum(len(gzip.compress(f.read_bytes(),mtime=0)) for f in files), 'source':url, 'sourceSha256':source_hash, 'license':'CC-BY-SA-4.0', 'snapshot':'zhwiktionary 2026-10-01; Kaikki extraction 2026-10-02', 'changes':'Simplified Chinese headwords and definitions only; traditional lookup aliases removed; source entry URLs retained for attribution; up to four definitions per headword; examples, quotations, pronunciation and media omitted. Resolved form redirects to canonical entries; discarded template and missing-definition placeholders.'}
(out / 'manifest.json').write_bytes(dump(stats))
print(json.dumps(stats, ensure_ascii=False), flush=True)
