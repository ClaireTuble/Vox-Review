import { useState } from 'react';
import { ShieldCheck, ShieldAlert, Search, Filter, AlertTriangle, Activity, Laptop, Clock } from 'lucide-react';
import Header from '../components/Header.jsx';
import Sidebar from '../components/Sidebar.jsx';
import TopActions from '../components/TopActions.jsx';
import { mockSuperAdminActivityLogs, mockSecurityNotifications } from '../data/superadminLogs.js';
import { mockCurrentUser } from '../data/users.js';
import '../css/dashboard.css';
import '../css/sidebar.css';
import '../css/header.css';
import '../css/cards.css';
import '../css/tables.css';
import '../css/responsive.css';

export default function AdminActivityLogs({ activeTab, setActiveTab, onSignOut }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [selectedType, setSelectedType] = useState('All');

  // Filter logs based on search query, status, and event type
  const filteredLogs = mockSuperAdminActivityLogs.filter((log) => {
    const matchesSearch =
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.ip.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.details.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = selectedStatus === 'All' || log.status === selectedStatus;
    const matchesType = selectedType === 'All' || log.eventType === selectedType;

    return matchesSearch && matchesStatus && matchesType;
  });

  return (
    <div className="superadmin-page-container">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onSignOut={onSignOut} />

      <main className="superadmin-viewport">
        <Header
          title="Admin Activity Logs"
          subtitle="Audit log of Super Admin authentication history, security alerts, and system configuration actions."
          user={mockCurrentUser}
        />

        <section className="admin-content-grid">
          <article className="admin-panel">
            <TopActions
              title="Super Admin Audit Trail"
              subtitle="Dedicated monitoring log for Super Admin authentication attempts, access events, and system actions."
            />

            {/* Security Alerts Summary Row */}
            <div className="security-alerts-banner-row">
              {mockSecurityNotifications.map((notif) => (
                <div key={notif.id} className={`security-alert-box alert-${notif.type}`}>
                  {notif.type === 'alert' ? (
                    <AlertTriangle size={18} className="alert-icon-danger" />
                  ) : (
                    <ShieldCheck size={18} className="alert-icon-info" />
                  )}
                  <div className="alert-box-text">
                    <strong className="alert-box-title">{notif.title}</strong>
                    <span className="alert-box-desc">{notif.message}</span>
                  </div>
                  <span className="alert-box-meta">
                    <Clock size={11} /> {notif.timestamp} &bull; IP: {notif.ip}
                  </span>
                </div>
              ))}
            </div>

            {/* Search & Filter Toolbar */}
            <div className="logs-filter-toolbar">
              <div className="logs-search-box">
                <Search size={15} />
                <input
                  type="text"
                  placeholder="Filter by admin, action, IP, or details..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="logs-search-input"
                />
              </div>

              <div className="logs-filter-group">
                <Filter size={14} className="filter-icon" />

                {/* Status Filter */}
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="logs-filter-select"
                >
                  <option value="All">All Statuses</option>
                  <option value="Successful">Successful</option>
                  <option value="Failed">Failed</option>
                  <option value="Warning">Warning</option>
                </select>

                {/* Event Type Filter */}
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="logs-filter-select"
                >
                  <option value="All">All Event Types</option>
                  <option value="Authentication">Authentication</option>
                  <option value="Access">Access</option>
                  <option value="Configuration">Configuration</option>
                  <option value="Diagnostic">Diagnostic</option>
                </select>
              </div>
            </div>

            {/* Logs Data Table */}
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Date &amp; Time</th>
                    <th>Admin Account</th>
                    <th>Activity / Action</th>
                    <th>Status</th>
                    <th>Event Type</th>
                    <th>Device / Browser</th>
                    <th>IP Address</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.length > 0 ? (
                    filteredLogs.map((log) => (
                      <tr key={log.id}>
                        <td style={{ fontSize: '11px', color: '#94a3b8', whitespace: 'nowrap' }}>
                          {log.timestamp}
                        </td>
                        <td>
                          <strong>{log.email}</strong>
                        </td>
                        <td>
                          <span className="log-action-text">{log.action}</span>
                        </td>
                        <td>
                          <span className={`status-pill status-${log.status.toLowerCase()}`}>
                            {log.status}
                          </span>
                        </td>
                        <td>
                          <span className="event-type-badge">{log.eventType}</span>
                        </td>
                        <td style={{ fontSize: '11px', color: '#cbd5e1' }}>{log.device}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '11px', color: '#60a5fa' }}>
                          {log.ip}
                        </td>
                        <td style={{ fontSize: '11px', color: '#94a3b8' }}>{log.details}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                        No admin activity logs found matching your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}
