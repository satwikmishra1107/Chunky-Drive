// Progress bar drawn as one block per 8 MB chunk, each filling as its bytes move.
// Big files would make blocks too thin, so above MAX_BLOCKS several chunks share a block.

const MAX_BLOCKS = 32;

export default function ChunkBar({ chunks }: { chunks: number[] }) {
  if (chunks.length === 0) return null;

  const perBlock = Math.ceil(chunks.length / MAX_BLOCKS);
  const blocks: number[] = [];
  for (let i = 0; i < chunks.length; i += perBlock) {
    const group = chunks.slice(i, i + perBlock);
    blocks.push(group.reduce((sum, fill) => sum + fill, 0) / group.length);
  }

  return (
    <div className="mt-2 flex h-1.5 gap-[3px]" aria-hidden="true">
      {blocks.map((fill, i) => (
        <div key={i} className="relative flex-1 overflow-hidden rounded-[2px] bg-hover">
          <div
            className={`absolute inset-y-0 left-0 transition-[width] duration-200 ${fill >= 1 ? "bg-accent" : "bg-accent/60"}`}
            style={{ width: `${Math.round(fill * 100)}%` }}
          />
        </div>
      ))}
    </div>
  );
}
