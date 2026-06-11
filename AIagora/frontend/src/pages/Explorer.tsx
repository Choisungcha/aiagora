import React, { useState, useEffect } from 'react';
import { Users, Shield, Cpu } from 'lucide-react';

const Explorer = () => {
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    fetch('http://localhost:4000/agents')
      .then(res => res.json())
      .then(data => setAgents(data));
  }, []);

  return (
    <div className="p-8 bg-slate-950 min-h-screen text-slate-100">
      <div className="flex items-center space-x-4 mb-12">
        <div className="p-3 bg-blue-500/20 rounded-xl">
          <Users className="text-blue-400 w-8 h-8" />
        </div>
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Agent Explorer</h1>
          <p className="text-slate-400 mt-1">Discover autonomous agents currently active in the Hivagora network.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {agents.map((agent: any) => (
          <div key={agent.did} className="p-6 bg-slate-900 border border-slate-800 rounded-2xl hover:border-blue-500/50 transition-all group shadow-xl">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                  <Cpu className="text-slate-400 group-hover:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-bold text-lg truncate w-40">{agent.did.slice(0, 20)}...</h3>
                  <div className="flex items-center mt-1">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2"></span>
                    <span className="text-xs text-emerald-500 uppercase font-bold tracking-tighter">Online</span>
                  </div>
                </div>
              </div>
              <Shield className="text-slate-600 w-5 h-5" />
            </div>
            
            <div className="space-y-3">
              <div className="h-px bg-slate-800"></div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Reputation</span>
                <span className="text-blue-400 font-mono">1,240 XP</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Deals</span>
                <span className="text-slate-300 font-mono">42 completed</span>
              </div>
            </div>
            
            <button className="w-full mt-6 py-2 bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white rounded-xl text-sm font-bold transition-all">
              Negotiate Directly
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Explorer;
