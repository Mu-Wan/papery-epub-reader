// Original recognition rules. Normalize only the matching view: stored offsets
// always refer to the unmodified text, including full-width characters and BOMs.
export const defaultSimpleOptions={chinese:true,english:true,numeric:true,special:true,volumes:true,maxTitleLength:80};
const cn='0-9零〇○一二三四五六七八九十百千万亿两兩壹贰貳叁參肆伍陆陸柒捌玖拾佰仟萬億';
const number=`[${cn}][${cn} \\t]{0,23}`;
const englishNumber='(?:[0-9]{1,6}|[IVXLCDM]{1,12}|(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)(?:[ -](?:one|two|three|four|five|six|seven|eight|nine|ten|hundred))*)';
const chineseChapter=new RegExp(`^(?:正文[ \\t]*)?第[ \\t]*${number}[章節节回话話讲講篇幕](?:.*)$`,'u');
const chineseVolume=new RegExp(`^(?:正文[ \\t]*)?(?:第[ \\t]*${number}卷.*|第[ \\t]*${number}[部册冊集](?:$|[ \\t:：、.()\\[【].*)|[卷部册冊集][ \\t]*${number}(?:$|[ \\t:：、.()\\[【].*)|[上中下前后後]卷(?:$|[ \\t:：、.()\\[【].*))$`,'u');
const englishChapter=new RegExp(`^(?:chapter|chap\\.?|section|act)[ \\t.]*${englishNumber}(?:$|[ \\t:：.、)\\]\\-–—].*)$`,'iu');
const englishVolume=new RegExp(`^(?:volume|vol\\.?|part|book)[ \\t.]*${englishNumber}(?:$|[ \\t:：.、)\\]\\-–—].*)$`,'iu');
const specialChapter=new RegExp(`^(?:序章|序言|序幕|前言|前记|前記|引言|引子|楔子|开篇|開篇|终章|終章|终话|終話|尾声|尾聲|后记|後記|后序|後序|结语|結語|结局|結局|大结局|大結局|完结篇|完結篇|番外篇?|外传|外傳|附录|附錄|附记|附記|致谢|致謝|间章|間章|幕间|幕間|序|跋)(?:$|[ \\t:：、.()\\[【].*|[${cn}]{1,12}(?:$|[ \\t:：、.()\\[【].*))$`,'u');
const englishSpecial=/^(?:prologue|epilogue|preface|foreword|afterword|introduction|appendix|acknowledg(?:e)?ments?)(?:$|[ \t:：.\-–—].*)$/iu;
const numericChapter=new RegExp(`^(?:[0-9]{1,6}(?:\\.[0-9]{1,3}){1,4}[ \\t]*[\\p{L}].*|[0-9]{1,6}[\\p{L}].*|[${cn}]{1,12}[ \\t]*[.、:：\\-—][ \\t]*[\\p{L}].*|[${cn}]{1,12}[ \\t]+[\\p{L}].*|\\([${cn}]{1,12}\\)[ \\t]*[\\p{L}].*|[0-9]{1,6}|[IVXLCDM]{1,12})$`,'u');
export function compileChapterPattern(pattern,mode){
 if(typeof pattern!=='string'||!pattern.trim())throw new Error('请填写章节匹配规则');
 if(pattern.length>2000)throw new Error('规则过长，请控制在 2000 个字符以内');
 const source=mode==='simple'?'^'+pattern.trim().split('').map(c=>c==='*'?'.*':c==='?'?'.':c.replace(/[\\^$.[\]{}()+|]/g,'\\$&')).join('')+'$':pattern;
 try{return new RegExp(source,'u')}catch{throw new Error('正则表达式格式不正确，请检查括号与转义符')}
}
function matchingTitle(title){
 let value=title.normalize('NFKC').replace(/[\u200b\uFEFF]/g,'').trim();
 value=value.replace(/^#{1,6}[ \t]+/,'');
 // Support a bracketed heading without treating ordinary quoted prose as one.
 if(/^[【\[「『《]/.test(value))value=value.slice(1).replace(/[】\]」』》](?=$|[ \t:：、])/,'');
 return value;
}
export function recognizeTxtChapters(text,rule){
 if(typeof text!=='string')throw new Error('文本无法读取');
 if(!rule||!['auto','simple','regex'].includes(rule.mode))throw new Error('分章规则无效');
 const guided=rule.mode==='auto'||rule.mode==='simple'&&!!rule.simple;
 const options={...defaultSimpleOptions,...(guided?rule.simple:{})};
 const maxLength=guided?Math.max(20,Math.min(160,Number(options.maxTitleLength)||80)):500;
 const chapter=guided?(rule.chapterPattern?.trim()?compileChapterPattern(rule.chapterPattern,'simple'):null):compileChapterPattern(rule.chapterPattern,rule.mode);
 const volume=rule.volumePattern?.trim()?compileChapterPattern(rule.volumePattern,guided?'simple':rule.mode):null;
 const chapters=[];let hasVolume=false;const lines=/[^\n]+/g;let match;
 while((match=lines.exec(text))){
  const raw=match[0],title=raw.trim();if(!title||title.length>maxLength)continue;
  const value=guided?matchingTitle(title):title;
  let isVolume=false,isChapter=false;
  if(volume?.test(value))isVolume=true;
  else if(chapter?.test(value))isChapter=true;
  else if(guided&&!/[。；;]$/.test(value)&&!/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:$|\s)/.test(value)){
   isVolume=options.volumes&&(chineseVolume.test(value)||englishVolume.test(value));
   isChapter=!isVolume&&(options.chinese&&chineseChapter.test(value)||options.english&&englishChapter.test(value)||options.numeric&&numericChapter.test(value)||options.special&&(specialChapter.test(value)||englishSpecial.test(value)));
  }
  if(!isVolume&&!isChapter)continue;
  if(isVolume)hasVolume=true;
  chapters.push({title,offset:match.index+Math.max(0,raw.indexOf(title)),index:chapters.length,level:isVolume?0:hasVolume?1:0});
  if(chapters.length>10000)throw new Error('匹配结果超过 10000 条，请缩小规则范围');
 }
 return chapters;
}
