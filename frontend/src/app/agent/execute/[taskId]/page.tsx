import AgentExecutionPanel from '@/components/agent/AgentExecutionPanel';

// Server Component - required for static export with generateStaticParams
export function generateStaticParams() {
  return [
    { taskId: 'default' },
    { taskId: 'demo' },
  ];
}

interface Props {
  params: Promise<{ taskId: string }>;
}

export default async function AgentExecutePage({ params }: Props) {
  const { taskId } = await params;
  return (
    <div className="h-screen w-full bg-[hsl(var(--bg-app))]">
      <AgentExecutionPanel taskId={taskId} />
    </div>
  );
}