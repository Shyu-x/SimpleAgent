'use client';

/**
 * 知识库管理组件
 *
 * 功能：
 * - 查看知识库列表
 * - 创建知识库
 * - 上传文档
 * - 查看文档状态
 * - 配置检索参数
 */

import React, { useState, useEffect, useCallback } from 'react';

interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  docCount: number;
  chunkCount: number;
  status: 'active' | 'indexing' | 'error';
  createdAt: string;
  config: {
    chunkSize: number;
    topK: number;
    rerankEnabled: boolean;
  };
}

export default function KnowledgeBaseManagement() {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedKb, setSelectedKb] = useState<KnowledgeBase | null>(null);

  const fetchKBs = async () => {
    try {
      const res = await fetch('/api/admin/knowledge-bases');
      const data = await res.json();
      setKbs(data.knowledgeBases || []);
    } catch (err) {
      console.error('Failed to fetch knowledge bases:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKBs();
  }, []);

  const handleUpload = useCallback(async (kbId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadProgress((e.loaded / e.total) * 100);
        }
      };

      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status === 200) resolve();
          else reject(new Error('Upload failed'));
        };
        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.open('POST', `/api/admin/knowledge-bases/${kbId}/documents`);
        xhr.send(formData);
      });

      setUploadProgress(0);
      setUploadFile(null);
      fetchKBs();
    } catch (err) {
      console.error('Upload failed:', err);
      setUploadProgress(0);
    }
  }, []);

  const createKB = async (name: string, description: string) => {
    try {
      await fetch('/api/admin/knowledge-bases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description })
      });
      setShowCreate(false);
      fetchKBs();
    } catch (err) {
      console.error('Failed to create KB:', err);
    }
  };

  if (loading) {
    return <div className="p-4">加载中...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">知识库管理</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          创建知识库
        </button>
      </div>

      {/* 创建知识库弹窗 */}
      {showCreate && (
        <CreateKBDialog
          onClose={() => setShowCreate(false)}
          onCreate={createKB}
        />
      )}

      {/* 知识库列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {kbs.map((kb) => (
          <div key={kb.id} className="bg-white border rounded-lg p-4">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-semibold text-lg">{kb.name}</h3>
                <p className="text-sm text-gray-500">{kb.description}</p>
              </div>
              <StatusBadge status={kb.status} />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
              <div>
                <span className="text-gray-500">文档数</span>
                <div className="font-medium">{kb.docCount}</div>
              </div>
              <div>
                <span className="text-gray-500">分块数</span>
                <div className="font-medium">{kb.chunkCount}</div>
              </div>
            </div>

            <div className="flex gap-2">
              <label className="flex-1">
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setUploadFile(file);
                      setSelectedKb(kb);
                    }
                  }}
                />
                <span className="block w-full px-3 py-2 bg-gray-100 text-center rounded cursor-pointer hover:bg-gray-200 text-sm">
                  上传文档
                </span>
              </label>
              <button className="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200 text-sm">
                配置
              </button>
            </div>

            {selectedKb?.id === kb.id && uploadFile && (
              <div className="mt-4">
                <div className="text-sm mb-1">{uploadFile.name}</div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <button
                  onClick={() => handleUpload(kb.id, uploadFile)}
                  className="mt-2 px-3 py-1 bg-blue-600 text-white rounded text-sm"
                >
                  开始上传
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    active: 'bg-green-100 text-green-800',
    indexing: 'bg-yellow-100 text-yellow-800',
    error: 'bg-red-100 text-red-800'
  };

  return (
    <span className={`px-2 py-1 rounded text-xs ${styles[status as keyof typeof styles]}`}>
      {status === 'active' ? '正常' : status === 'indexing' ? '索引中' : '错误'}
    </span>
  );
}

function CreateKBDialog({
  onClose,
  onCreate
}: {
  onClose: () => void;
  onCreate: (name: string, description: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">创建知识库</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="输入知识库名称"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="输入知识库描述"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">
            取消
          </button>
          <button
            onClick={() => onCreate(name, description)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            创建
          </button>
        </div>
      </div>
    </div>
  );
}
