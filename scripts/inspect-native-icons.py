from pathlib import Path
import struct, hashlib, json
root=Path(__file__).resolve().parents[1]
b=(root/'src-tauri/target/release/papery-reader.exe').read_bytes()
u16=lambda offset:struct.unpack_from('<H',b,offset)[0]
u32=lambda offset:struct.unpack_from('<I',b,offset)[0]
pe=u32(0x3c);opt=pe+24;sections=opt+u16(pe+20)
def address(rva):
    for i in range(u16(pe+6)):
        start=sections+40*i;va=u32(start+12)
        if va<=rva<va+max(u32(start+8),u32(start+16)):
            return u32(start+20)+rva-va
    raise ValueError('RVA outside PE sections')
directory=opt+(112 if u16(opt)==0x20b else 96)
base=address(u32(directory+16))
def entries(relative):
    start=base+relative
    return [struct.unpack_from('<II',b,start+16+8*i) for i in range(u16(start+12)+u16(start+14))]
def resources(relative):
    result=[]
    for key,value in entries(relative):
        if value&0x80000000:result.extend(resources(value&0x7fffffff))
        else:
            data=base+value;rva,size=struct.unpack_from('<II',b,data);start=address(rva)
            result.append(b[start:start+size])
    return result
types=dict(entries(0));groups=resources(types[14]&0x7fffffff)
native={key:resources(value&0x7fffffff)[0] for key,value in entries(types[3]&0x7fffffff)}
ico=(root/'src-tauri/icons/icon.ico').read_bytes();expected={}
for i in range(struct.unpack_from('<H',ico,4)[0]):
    start=6+16*i;w,h=ico[start:start+2];size,offset=struct.unpack_from('<II',ico,start+8)
    expected[(w or 256,h or 256)]=ico[offset:offset+size]
results=[]
for group in groups:
    for i in range(struct.unpack_from('<H',group,4)[0]):
        start=6+14*i;w,h=group[start:start+2];identifier=struct.unpack_from('<H',group,start+12)[0]
        dimensions=(w or 256,h or 256)
        if hashlib.sha256(native[identifier]).digest()!=hashlib.sha256(expected[dimensions]).digest():raise ValueError('Icon differs from master export')
        results.append(dimensions)
print(json.dumps({'embeddedIconSizes':sorted(results),'payloadsMatchMasterExport':True}))
