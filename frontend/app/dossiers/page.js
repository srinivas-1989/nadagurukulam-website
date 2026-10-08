'use client';
import { useState } from 'react';
import DossiersFillPage from './FillAssessment'; // Needs to be created
import DossierAdminPage from './AssessmentBuilder'; // Renamed from admin panel
import AccessControlPage from './AccessControl';
import HighlightsPage from './Highlights';

const tabBtn = { padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', borderBottom: '2px solid transparent' };
const activeTabBtn = { ...tabBtn, borderBottom: '2px solid var(--primary)', color: 'var(--primary)', fontWeight: 600 };

export default function StudentAssessmentPage() {
  const [activeTab, setActiveTab] = useState('fill');

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <div style={{ display: 'flex', gap: '10px', borderBottom: '1px solid var(--border)' }}>
        <button style={activeTab === 'fill' ? activeTabBtn : tabBtn} onClick={() => setActiveTab('fill')}>Fill Assessment</button>
        <button style={activeTab === 'builder' ? activeTabBtn : tabBtn} onClick={() => setActiveTab('builder')}>Assessment Builder</button>
        <button style={activeTab === 'access' ? activeTabBtn : tabBtn} onClick={() => setActiveTab('access')}>Access Control</button>
        <button style={activeTab === 'highlights' ? activeTabBtn : tabBtn} onClick={() => setActiveTab('highlights')}>Highlights</button>
      </div>

      {activeTab === 'fill' && <DossiersFillPage />}
      {activeTab === 'builder' && <DossierAdminPage />}
      {activeTab === 'access' && <AccessControlPage />}
      {activeTab === 'highlights' && <HighlightsPage />}
    </div>
  );
}
