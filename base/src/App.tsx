import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-base-200 flex flex-col items-center justify-center">
      <div className="flex gap-8 mb-8">
        <a href="https://vite.dev" target="_blank" className="btn btn-ghost btn-sm">
          <img src={viteLogo} className="h-8 w-8" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank" className="btn btn-ghost btn-sm">
          <img src={reactLogo} className="h-8 w-8 animate-spin" alt="React logo" />
        </a>
      </div>
      <h1 className="text-5xl font-bold text-primary mb-8">Husky.ai</h1>
      <div className="card bg-base-100 shadow-xl p-8 text-center max-w-md">
        <div className="card-body">
          <button 
            onClick={() => setCount((count) => count + 1)}
            className="btn btn-primary btn-lg mb-4"
          >
            count is {count}
          </button>
          <p className="text-base-content/70">
            Edit <code className="badge badge-ghost">src/App.tsx</code> and save to test HMR
          </p>
        </div>
      </div>
    </div>
  )
}

export default App
