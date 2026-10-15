import { enterBlock, setAgeOk } from "./sim";

export function AgeGate() {
  return (
    <main className="bg-bg text-fg mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-6 px-5 py-10">
      <p className="text-accent text-xs font-medium tracking-widest">NDU</p>
      <h1 className="font-display text-5xl leading-none">Your street, live</h1>
      <p className="text-muted text-base">
        A real map of where you are. You appear only if you turn visibility on, and other people see the block, not
        your door. The township block is still a game. Nothing here pays out.
      </p>
      <button
        type="button"
        className="bg-accent text-bg min-h-12 rounded-full px-5 text-base font-medium"
        onClick={() => {
          setAgeOk(true);
          enterBlock();
        }}
      >
        I am 18 or older
      </button>
      <p className="text-muted text-sm">This phone remembers that you said you are 18 or older. It is not an ID check.</p>
    </main>
  );
}
