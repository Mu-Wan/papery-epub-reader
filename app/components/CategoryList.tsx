"use client";
import { PenLine, X } from "./PaperyIcons";

type Props = {
  names: string[];
  selected: string;
  counts: Record<string, number>;
  onSelect: (name: string) => void;
  onEdit: (name: string) => void;
  onDelete: (name: string) => void;
};

export function CategoryList({ names, selected, counts, onSelect, onEdit, onDelete }: Props) {
  return <div className="categoryList">{names.map(name => <div
    key={name}
    data-category-name={name}
    className={`categoryRow ${selected === name ? "selected" : ""}`}
  >
    <button
      aria-pressed={selected === name}
      className="categoryButton"
      onDoubleClick={() => { if (name !== "未分类") onEdit(name); }}
      onKeyDown={event => {
        if (event.key === "F2" && name !== "未分类") {
          event.preventDefault();
          onEdit(name);
        }
      }}
      onClick={() => onSelect(name)}
    ><span><b className="dot"/>{name}</span><em>{counts[name] || 0}</em></button>
    {name !== "未分类" ? <div className="categoryActions">
      <button className="categoryEdit" aria-label={`编辑分类 ${name}`} onClick={() => onEdit(name)}><PenLine size={13}/></button>
      <button className="categoryDelete" aria-label={`删除分类 ${name}`} onClick={() => onDelete(name)}><X size={13}/></button>
    </div> : <span className="categoryActionSpace" aria-hidden="true"/>}
  </div>)}</div>;
}
