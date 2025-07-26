import { useState } from "react";

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="min-h-screen bg-base-200 flex flex-col items-center justify-center">
      <h1 className="text-5xl font-bold text-primary mb-8">Husky.ai</h1>
      <div className="card bg-base-100 shadow-xl p-8 text-center max-w-md">
        <div className="card-body">
          <button
            onClick={() => setCount((count) => count + 1)}
            className="btn btn-primary btn-lg mb-4"
          >
            count is {count}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
