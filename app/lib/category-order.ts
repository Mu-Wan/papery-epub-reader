export function orderedCategories(names:string[],savedOrder:unknown=[]):string[] {
  const order=Array.isArray(savedOrder)?savedOrder.filter((name):name is string=>typeof name==="string"):[];
  const available=new Set(names.filter(name=>name&&name!=="未分类"));
  return [...order.filter((name,index)=>available.has(name)&&order.indexOf(name)===index),...Array.from(available).filter(name=>!order.includes(name)),"未分类"];
}
