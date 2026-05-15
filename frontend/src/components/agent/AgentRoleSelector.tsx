'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, ChevronDown, Search, Filter, Users } from 'lucide-react';

interface AgentRole {
  id: string;
  name: string;
  role: string;
  goal: string;
  backstory: string;
  capabilities: string[];
  icon: string;
  color: string;
}

interface AgentRoleSelectorProps {
  value?: string;
  onChange: (roleId: string) => void;
  filterByCapability?: string;
}

export default function AgentRoleSelector({
  value,
  onChange,
  filterByCapability
}: AgentRoleSelectorProps) {
  const [roles, setRoles] = useState<AgentRole[]>([]);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCapability, setSelectedCapability] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    try {
      const [rolesRes, capsRes] = await Promise.all([
        fetch('/api/agent-dispatch/roles'),
        fetch('/api/agent-dispatch/capabilities')
      ]);
      const rolesData = await rolesRes.json();
      const capsData = await capsRes.json();
      setRoles(rolesData.data || []);
      setCapabilities(capsData.data || []);
    } catch (error) {
      console.error('Failed to fetch roles:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedRole = roles.find(r => r.id === value);

  const filteredRoles = roles.filter(role => {
    const matchesSearch = searchQuery === '' ||
      role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      role.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      role.capabilities.some(cap => cap.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCapability = !selectedCapability ||
      role.capabilities.includes(selectedCapability);

    return matchesSearch && matchesCapability;
  });

  if (loading) {
    return (
      <div className="animate-pulse h-10 w-full bg-[hsl(var(--bg-muted))]/40 rounded-xl" />
    );
  }

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))] hover:bg-[hsl(var(--bg-muted))]/50 transition-all duration-200"
      >
        {selectedRole ? (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="text-lg">{selectedRole.icon}</span>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-sm font-medium text-[hsl(var(--text-main))] truncate">
                {selectedRole.name}
              </div>
              <div className="text-xs text-[hsl(var(--text-muted))] truncate">
                {selectedRole.role}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 flex-1">
            <Bot size={18} className="text-[hsl(var(--text-muted))]" />
            <span className="text-sm text-[hsl(var(--text-muted))]">
              选择 Agent 角色
            </span>
          </div>
        )}
        <ChevronDown
          size={18}
          className={`text-[hsl(var(--text-muted))] transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />

            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full left-0 right-0 mt-2 z-50 bg-[hsl(var(--bg-surface))] border border-[hsl(var(--border-subtle))] rounded-xl shadow-xl overflow-hidden"
            >
              {/* Search & Filter */}
              <div className="p-3 border-b border-[hsl(var(--border-subtle))] space-y-2">
                {/* Search Input */}
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--text-muted))]" />
                  <input
                    type="text"
                    placeholder="搜索角色或能力..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm bg-[hsl(var(--bg-muted))]/50 rounded-lg border border-[hsl(var(--border-subtle))] focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  />
                </div>

                {/* Capability Filter */}
                <div className="flex items-center gap-2">
                  <Filter size={14} className="text-[hsl(var(--text-muted))]" />
                  <select
                    value={selectedCapability}
                    onChange={(e) => setSelectedCapability(e.target.value)}
                    className="flex-1 px-2 py-1.5 text-xs bg-[hsl(var(--bg-muted))]/50 rounded-lg border border-[hsl(var(--border-subtle))] focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">全部能力</option>
                    {capabilities.map(cap => (
                      <option key={cap} value={cap}>{cap}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Role List */}
              <div className="max-h-80 overflow-y-auto p-2">
                {filteredRoles.length === 0 ? (
                  <div className="py-8 text-center text-sm text-[hsl(var(--text-muted))]">
                    <Users size={24} className="mx-auto mb-2 opacity-50" />
                    <div>没有匹配的角色</div>
                  </div>
                ) : (
                  filteredRoles.map(role => (
                    <button
                      key={role.id}
                      onClick={() => {
                        onChange(role.id);
                        setIsOpen(false);
                        setSearchQuery('');
                      }}
                      className={`w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all ${
                        value === role.id
                          ? 'bg-primary/10 ring-1 ring-primary/30'
                          : 'hover:bg-[hsl(var(--bg-muted))]/50'
                      }`}
                    >
                      <span className="text-xl mt-0.5">{role.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-[hsl(var(--text-main))]">
                            {role.name}
                          </span>
                          <span
                            className="px-1.5 py-0.5 text-[10px] rounded-full"
                            style={{ backgroundColor: `${role.color}20`, color: role.color }}
                          >
                            {role.role}
                          </span>
                        </div>
                        <div className="text-xs text-[hsl(var(--text-muted))] mt-1 line-clamp-2">
                          {role.goal}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {role.capabilities.slice(0, 3).map(cap => (
                            <span
                              key={cap}
                              className="px-1.5 py-0.5 text-[10px] rounded bg-[hsl(var(--bg-muted))] text-[hsl(var(--text-muted))]"
                            >
                              {cap}
                            </span>
                          ))}
                          {role.capabilities.length > 3 && (
                            <span className="text-[10px] text-[hsl(var(--text-muted))]">
                              +{role.capabilities.length - 3}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}