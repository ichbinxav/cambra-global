export default function MissingDataChips({ items }){
  if (!items || items.length===0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {items.map((m,i)=>(
        <span key={i} className="text-[10px] px-2 py-0.5 rounded-full border">Falta: {m}</span>
      ))}
    </div>
  );
}