import React, { useState, useCallback } from 'react';
import PlazaMain, { type Page, type DealRecord } from './pages/PlazaMain';
import GoalSetter from './pages/GoalSetter';
import Approval from './pages/Approval';

export default function App() {
  const [page, setPage]       = useState<Page>('plaza');
  const [deals, setDeals]       = useState<DealRecord[]>([]);
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const [rejected, setRejected] = useState<Record<string, boolean>>({});

  const navigate = useCallback((p: Page) => setPage(p), []);

  const onDeal = useCallback((deal: DealRecord) => {
    setDeals(prev => {
      if (prev.find(d => d.id === deal.id)) return prev;
      return [deal, ...prev];
    });
  }, []);

  const onApprove = useCallback((id: string) => {
    setApproved(prev => ({ ...prev, [id]: true }));
  }, []);

  const onReject = useCallback((id: string) => {
    setRejected(prev => ({ ...prev, [id]: true }));
  }, []);

  const pendingDeals = deals.filter(d => !approved[d.id] && !rejected[d.id]);

  return (
    <>
      {page === 'plaza'    && (
        <PlazaMain
          navigate={navigate}
          onDeal={onDeal}
          pendingDeals={pendingDeals}
        />
      )}
      {page === 'goals'    && <GoalSetter navigate={navigate} />}
      {page === 'approval' && (
        <Approval
          navigate={navigate}
          deals={deals}
          onApprove={onApprove}
          onReject={onReject}
        />
      )}
    </>
  );
}
