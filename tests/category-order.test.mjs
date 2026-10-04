import test from "node:test";
import assert from "node:assert/strict";
import { orderedCategories } from "../app/lib/category-order.ts";
import { portableSetting, validateSnapshot } from "../app/lib/sync-merge.ts";

test("Categories restore saved order, append new categories, and keep uncategorized last",()=>{
  assert.deepEqual(orderedCategories(["未分类","文学","历史","文学","新增"],["历史","已删","历史","文学"]),["历史","文学","新增","未分类"]);
  assert.deepEqual(orderedCategories([]),["未分类"]);
  assert.deepEqual(orderedCategories(["A"],"invalid"),["A","未分类"]);
});
test("Category ordering is a portable setting while account credentials remain private",()=>{
  assert.equal(portableSetting("category-order"),true);
  assert.equal(portableSetting("google-drive"),false);
});

test("Category order backup validation accepts arrays and rejects malformed values before merging",()=>{
  const snapshot={format:"papery-backup",version:1,exportedAt:"",books:[],annotations:[],sessions:[],categories:[],settings:[{key:"category-order",value:["B","A","未分类"]}]};
  assert.doesNotThrow(()=>validateSnapshot(snapshot));
  snapshot.settings[0].value=[123];assert.throws(()=>validateSnapshot(snapshot),/分类顺序/);
});
