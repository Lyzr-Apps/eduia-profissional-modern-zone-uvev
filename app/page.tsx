'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { callAIAgent, extractText } from '@/lib/aiAgent'
import { copyToClipboard } from '@/lib/clipboard'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
// Skeleton available if needed
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
// Tabs available if needed
import { FiHome, FiMessageSquare, FiClock, FiShoppingCart, FiMenu, FiX, FiSend, FiCopy, FiCheck, FiChevronLeft, FiPlus, FiSearch, FiAlertCircle, FiChevronDown, FiChevronUp, FiExternalLink } from 'react-icons/fi'
import { FaGraduationCap, FaFileAlt, FaCoins } from 'react-icons/fa'
import { HiDocumentText, HiPresentationChartBar } from 'react-icons/hi'
import { IoSparkles } from 'react-icons/io5'

const AGENT_ID = '6998de3ee5ae4890f6e2bfa0'
const POINTS_PER_GENERATION = 75
const INITIAL_POINTS = 250

// Types
interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  artifactFiles?: Array<{ file_url: string }>
}

interface HistoryEntry {
  id: string
  topic: string
  level: string
  format: string
  pageCount: number
  content: string
  date: string
  pointCost: number
  messages: ChatMessage[]
}

// Helper to generate unique IDs
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
}

// Markdown renderer
function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-2">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### '))
          return <h4 key={i} className="font-semibold text-sm mt-3 mb-1">{formatInline(line.slice(4))}</h4>
        if (line.startsWith('## '))
          return <h3 key={i} className="font-semibold text-base mt-3 mb-1">{formatInline(line.slice(3))}</h3>
        if (line.startsWith('# '))
          return <h2 key={i} className="font-bold text-lg mt-4 mb-2">{formatInline(line.slice(2))}</h2>
        if (line.startsWith('- ') || line.startsWith('* '))
          return <li key={i} className="ml-4 list-disc text-sm leading-relaxed">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line))
          return <li key={i} className="ml-4 list-decimal text-sm leading-relaxed">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm leading-relaxed">{formatInline(line)}</p>
      })}
    </div>
  )
}

function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part
  )
}

// ErrorBoundary
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">Algo deu errado</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button onClick={() => this.setState({ hasError: false, error: '' })} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm">
              Tentar novamente
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// Sidebar nav item component
function NavItem({ icon, label, active, onClick, collapsed }: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
  collapsed: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${active ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-secondary'}`}
    >
      <span className="flex-shrink-0 text-lg">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  )
}

// Points display component
function PointsBadge({ points, onClick }: { points: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary rounded-full text-sm font-medium text-secondary-foreground hover:bg-muted transition-colors">
      <FaCoins className="text-primary" />
      <span>{points} pts</span>
    </button>
  )
}

// Chat bubble
function ChatBubble({ message, onCopy }: { message: ChatMessage; onCopy: (text: string) => void }) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'

  const handleCopy = async () => {
    await onCopy(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[85%] ${isUser ? 'order-1' : 'order-1'}`}>
        <div className={`rounded-2xl px-4 py-3 shadow-sm ${isUser ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-card border border-border rounded-bl-md'}`}>
          {isUser ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="text-foreground">
              {renderMarkdown(message.content)}
              {Array.isArray(message?.artifactFiles) && message.artifactFiles.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  {message.artifactFiles.map((file, idx) => (
                    <a key={idx} href={file?.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                      <FiExternalLink className="w-3.5 h-3.5" />
                      Baixar arquivo {idx + 1}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className={`flex items-center gap-2 mt-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
          <span className="text-xs text-muted-foreground">{message.timestamp}</span>
          {!isUser && (
            <button onClick={handleCopy} className="text-muted-foreground hover:text-foreground transition-colors p-0.5">
              {copied ? <FiCheck className="w-3.5 h-3.5 text-green-600" /> : <FiCopy className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Typing indicator
function TypingIndicator() {
  return (
    <div className="flex justify-start mb-4">
      <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <IoSparkles className="w-4 h-4 text-primary animate-pulse" />
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span className="text-xs text-muted-foreground ml-1">Gerando conteudo...</span>
        </div>
      </div>
    </div>
  )
}

// History card
function HistoryCard({ entry, onExpand, expanded }: {
  entry: HistoryEntry
  onExpand: (id: string) => void
  expanded: boolean
}) {
  const [copied, setCopied] = useState(false)

  const handleCopyContent = async () => {
    const success = await copyToClipboard(entry.content)
    if (success) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
      <CardContent className="p-4">
        <button onClick={() => onExpand(entry.id)} className="w-full text-left">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm text-foreground truncate">{entry.topic || 'Sem titulo'}</h3>
              <p className="text-xs text-muted-foreground mt-1">{entry.date}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Badge variant="secondary" className="text-xs">
                {entry.level}
              </Badge>
              <Badge variant="outline" className="text-xs flex items-center gap-1">
                {entry.format === 'slides' ? <HiPresentationChartBar className="w-3 h-3" /> : <HiDocumentText className="w-3 h-3" />}
                {entry.format === 'slides' ? 'Slides' : 'Doc'}
              </Badge>
              {expanded ? <FiChevronUp className="w-4 h-4 text-muted-foreground" /> : <FiChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <FaCoins className="w-3 h-3" />
              {entry.pointCost} pts
            </span>
            {entry.pageCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {entry.pageCount} {entry.format === 'slides' ? 'slides' : 'paginas'}
              </span>
            )}
          </div>
        </button>
        {expanded && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex justify-end mb-2">
              <Button variant="ghost" size="sm" onClick={handleCopyContent} className="text-xs h-7">
                {copied ? <><FiCheck className="w-3.5 h-3.5 mr-1" /> Copiado</> : <><FiCopy className="w-3.5 h-3.5 mr-1" /> Copiar</>}
              </Button>
            </div>
            <ScrollArea className="max-h-96">
              <div className="pr-4 text-foreground">
                {renderMarkdown(entry.content)}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Purchase plan card
function PlanCard({ title, points, price, perWork, bestValue, onBuy }: {
  title: string
  points: number
  price: string
  perWork: string
  bestValue: boolean
  onBuy: () => void
}) {
  return (
    <Card className={`shadow-md relative transition-all duration-200 hover:shadow-lg ${bestValue ? 'border-2 border-primary ring-2 ring-primary/20' : ''}`}>
      {bestValue && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-primary text-primary-foreground text-xs px-3 py-0.5 shadow-sm">
            Melhor Valor
          </Badge>
        </div>
      )}
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        <CardDescription className="text-muted-foreground">{points.toLocaleString('pt-BR')} pontos</CardDescription>
      </CardHeader>
      <CardContent className="text-center pb-4">
        <p className="text-3xl font-bold text-foreground">{price}</p>
        <p className="text-xs text-muted-foreground mt-1">{perWork}</p>
      </CardContent>
      <CardFooter className="pt-0">
        <Button onClick={onBuy} className="w-full" variant={bestValue ? 'default' : 'outline'}>
          <FiShoppingCart className="w-4 h-4 mr-2" />
          Comprar
        </Button>
      </CardFooter>
    </Card>
  )
}

// Agent status section
function AgentStatusSection({ isActive }: { isActive: boolean }) {
  return (
    <Card className="shadow-md">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isActive ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">EduIA Content Generator</p>
            <p className="text-xs text-muted-foreground">Agente de geracao de conteudo academico</p>
          </div>
          <Badge variant={isActive ? 'default' : 'secondary'} className="text-xs flex-shrink-0">
            {isActive ? 'Ativo' : 'Pronto'}
          </Badge>
        </div>
      </CardContent>
    </Card>
  )
}

// Sample data
const SAMPLE_HISTORY: HistoryEntry[] = [
  {
    id: 'sample-1',
    topic: 'Revolucao Industrial e suas consequencias sociais',
    level: 'Faculdade',
    format: 'documento',
    pageCount: 10,
    content: '# Revolucao Industrial e suas consequencias sociais\n\n## Introducao\n\nA Revolucao Industrial foi um dos marcos mais significativos da historia moderna, transformando profundamente as relacoes economicas, sociais e culturais da humanidade.\n\n## Desenvolvimento\n\n### Contexto Historico\n\nA Revolucao Industrial teve inicio na Inglaterra, no final do seculo XVIII, e se espalhou progressivamente por toda a Europa e outros continentes.\n\n### Consequencias Sociais\n\n- Urbanizacao acelerada\n- Surgimento da classe operaria\n- Mudancas nas relacoes de trabalho\n- Impactos ambientais\n\n## Conclusao\n\nA Revolucao Industrial transformou irreversivelmente a sociedade, criando as bases para o mundo moderno.\n\n## Referencias\n\n1. HOBSBAWM, Eric. A Era das Revolucoes. Paz & Terra, 2010.\n2. THOMPSON, E.P. A Formacao da Classe Operaria Inglesa. Paz & Terra, 2012.',
    date: '18/02/2026',
    pointCost: 75,
    messages: []
  },
  {
    id: 'sample-2',
    topic: 'Fotossintese e ciclo do carbono',
    level: 'Medio',
    format: 'slides',
    pageCount: 15,
    content: '# Fotossintese e Ciclo do Carbono\n\n## Slide 1: Introducao\n\nA fotossintese e o processo pelo qual plantas convertem energia solar em energia quimica.\n\n## Slide 2: Processo da Fotossintese\n\n- Fase clara (fotoquimica)\n- Fase escura (ciclo de Calvin)\n- Fatores limitantes\n\n## Slide 3: Ciclo do Carbono\n\nO ciclo do carbono e essencial para a manutencao da vida na Terra.',
    date: '17/02/2026',
    pointCost: 75,
    messages: []
  },
  {
    id: 'sample-3',
    topic: 'Operacoes matematicas basicas',
    level: 'Fundamental',
    format: 'documento',
    pageCount: 5,
    content: '# Operacoes Matematicas Basicas\n\n## Introducao\n\nAs quatro operacoes matematicas basicas sao a base de todo o conhecimento matematico.\n\n## Adicao\n\nA adicao e a operacao de somar dois ou mais numeros.\n\n## Subtracao\n\nA subtracao e a operacao inversa da adicao.\n\n## Multiplicacao\n\nA multiplicacao e uma forma simplificada de adicoes repetidas.\n\n## Divisao\n\nA divisao distribui um valor em partes iguais.',
    date: '16/02/2026',
    pointCost: 75,
    messages: []
  },
  {
    id: 'sample-4',
    topic: 'Redes de computadores e protocolos TCP/IP',
    level: 'Tecnico',
    format: 'documento',
    pageCount: 8,
    content: '# Redes de Computadores e Protocolos TCP/IP\n\n## Introducao\n\nAs redes de computadores sao essenciais para a comunicacao moderna.\n\n## Modelo OSI\n\n- Camada fisica\n- Camada de enlace\n- Camada de rede\n- Camada de transporte\n\n## Protocolo TCP/IP\n\nO TCP/IP e o conjunto de protocolos que fundamenta a Internet.',
    date: '15/02/2026',
    pointCost: 75,
    messages: []
  },
  {
    id: 'sample-5',
    topic: 'Literatura brasileira: Machado de Assis',
    level: 'Medio',
    format: 'documento',
    pageCount: 7,
    content: '# Literatura Brasileira: Machado de Assis\n\n## Introducao\n\nMachado de Assis e considerado o maior escritor brasileiro de todos os tempos.\n\n## Obras Principais\n\n- Dom Casmurro\n- Memorias Postumas de Bras Cubas\n- Quincas Borba\n\n## Estilo Literario\n\nMachado desenvolveu um estilo unico, marcado pela ironia e pela profundidade psicologica.',
    date: '14/02/2026',
    pointCost: 75,
    messages: []
  }
]

export default function Page() {
  // Screen state
  const [activeScreen, setActiveScreen] = useState<'dashboard' | 'chat' | 'history' | 'buy'>('dashboard')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showBuyModal, setShowBuyModal] = useState(false)

  // Points state
  const [points, setPoints] = useState(INITIAL_POINTS)

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [chatError, setChatError] = useState('')
  const [chatSuccess, setChatSuccess] = useState('')

  // Session state
  const [userId, setUserId] = useState('')
  const [sessionId, setSessionId] = useState('')

  // History state
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)
  const [historySearch, setHistorySearch] = useState('')
  const [historyLevelFilter, setHistoryLevelFilter] = useState('all')
  const [historyFormatFilter, setHistoryFormatFilter] = useState('all')

  // Sample data toggle
  const [showSampleData, setShowSampleData] = useState(false)

  // Active agent tracking
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)

  // Purchase success message
  const [purchaseSuccess, setPurchaseSuccess] = useState('')

  // Refs
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Initialize from localStorage
  useEffect(() => {
    try {
      const storedPoints = localStorage.getItem('eduia_points')
      if (storedPoints !== null) {
        setPoints(parseInt(storedPoints, 10))
      }
      const storedHistory = localStorage.getItem('eduia_history')
      if (storedHistory) {
        const parsed = JSON.parse(storedHistory)
        if (Array.isArray(parsed)) {
          setHistory(parsed)
        }
      }
      let storedUserId = localStorage.getItem('eduia_user_id')
      if (!storedUserId) {
        storedUserId = generateId()
        localStorage.setItem('eduia_user_id', storedUserId)
      }
      setUserId(storedUserId)
      let storedSessionId = localStorage.getItem('eduia_session_id')
      if (!storedSessionId) {
        storedSessionId = generateId()
        localStorage.setItem('eduia_session_id', storedSessionId)
      }
      setSessionId(storedSessionId)
    } catch (e) {
      // localStorage may not be available
    }
  }, [])

  // Persist points
  useEffect(() => {
    try {
      localStorage.setItem('eduia_points', points.toString())
    } catch (e) { /* ignore */ }
  }, [points])

  // Persist history
  useEffect(() => {
    try {
      localStorage.setItem('eduia_history', JSON.stringify(history))
    } catch (e) { /* ignore */ }
  }, [history])

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isGenerating])

  // Get formatted timestamp
  const getTimestamp = useCallback(() => {
    const now = new Date()
    return now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }, [])

  const getDateString = useCallback(() => {
    const now = new Date()
    return now.toLocaleDateString('pt-BR')
  }, [])

  // Start new work session
  const startNewWork = useCallback(() => {
    const newSessionId = generateId()
    setSessionId(newSessionId)
    try {
      localStorage.setItem('eduia_session_id', newSessionId)
    } catch (e) { /* ignore */ }
    setMessages([])
    setChatError('')
    setChatSuccess('')
    setActiveScreen('chat')
    setMobileMenuOpen(false)
  }, [])

  // Send message
  const sendMessage = useCallback(async () => {
    const trimmed = inputValue.trim()
    if (!trimmed || isGenerating) return

    // Check points
    if (points < POINTS_PER_GENERATION) {
      setShowBuyModal(true)
      return
    }

    setChatError('')
    setChatSuccess('')

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: trimmed,
      timestamp: getTimestamp()
    }
    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsGenerating(true)
    setActiveAgentId(AGENT_ID)

    try {
      const result = await callAIAgent(trimmed, AGENT_ID, {
        user_id: userId,
        session_id: sessionId
      })

      if (result.success) {
        const text = result?.response?.result?.response || extractText(result.response) || ''
        const artifactFiles = Array.isArray(result?.module_outputs?.artifact_files)
          ? result.module_outputs!.artifact_files
          : []

        const assistantMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: text,
          timestamp: getTimestamp(),
          artifactFiles: artifactFiles.length > 0 ? artifactFiles : undefined
        }
        setMessages(prev => [...prev, assistantMessage])

        // Deduct points
        setPoints(prev => Math.max(0, prev - POINTS_PER_GENERATION))

        // Determine topic from the first user message in this session
        const firstUserMsg = messages.find(m => m.role === 'user')
        const topic = firstUserMsg?.content || trimmed

        // Extract level heuristic
        let level = 'Faculdade'
        const lowerTopic = topic.toLowerCase()
        if (lowerTopic.includes('fundamental') || lowerTopic.includes('basico')) level = 'Fundamental'
        else if (lowerTopic.includes('medio') || lowerTopic.includes('ensino medio')) level = 'Medio'
        else if (lowerTopic.includes('tecnico') || lowerTopic.includes('tecnologo')) level = 'Tecnico'

        // Extract format heuristic
        let format = 'documento'
        if (lowerTopic.includes('slide') || lowerTopic.includes('apresentacao') || lowerTopic.includes('powerpoint')) format = 'slides'

        // Save to history
        const entry: HistoryEntry = {
          id: generateId(),
          topic: topic.length > 80 ? topic.substring(0, 80) + '...' : topic,
          level,
          format,
          pageCount: 0,
          content: text,
          date: getDateString(),
          pointCost: POINTS_PER_GENERATION,
          messages: [...messages, userMessage, assistantMessage]
        }
        setHistory(prev => [entry, ...prev])
        setChatSuccess('Conteudo gerado com sucesso!')
        setTimeout(() => setChatSuccess(''), 4000)
      } else {
        const errorMsg = result?.error || result?.response?.message || 'Erro ao gerar conteudo. Tente novamente.'
        setChatError(errorMsg)
        // Refund points on error - don't deduct
      }
    } catch (err) {
      setChatError('Erro de conexao. Verifique sua internet e tente novamente.')
    } finally {
      setIsGenerating(false)
      setActiveAgentId(null)
    }
  }, [inputValue, isGenerating, points, userId, sessionId, messages, getTimestamp, getDateString])

  // Handle key press
  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }, [sendMessage])

  // Copy message to clipboard
  const handleCopyMessage = useCallback(async (text: string) => {
    await copyToClipboard(text)
  }, [])

  // Buy points
  const handleBuyPoints = useCallback((amount: number) => {
    setPoints(prev => prev + amount)
    setShowBuyModal(false)
    setPurchaseSuccess(`${amount.toLocaleString('pt-BR')} pontos adicionados com sucesso!`)
    setTimeout(() => setPurchaseSuccess(''), 4000)
  }, [])

  // History expand toggle
  const handleExpandHistory = useCallback((id: string) => {
    setExpandedHistoryId(prev => prev === id ? null : id)
  }, [])

  // Navigate
  const navigateTo = useCallback((screen: 'dashboard' | 'chat' | 'history' | 'buy') => {
    if (screen === 'buy') {
      setShowBuyModal(true)
    } else {
      setActiveScreen(screen)
    }
    setMobileMenuOpen(false)
  }, [])

  // Filter history
  const displayHistory = showSampleData && history.length === 0 ? SAMPLE_HISTORY : history
  const filteredHistory = displayHistory.filter(entry => {
    const matchesSearch = !historySearch || (entry?.topic ?? '').toLowerCase().includes(historySearch.toLowerCase())
    const matchesLevel = historyLevelFilter === 'all' || entry.level === historyLevelFilter
    const matchesFormat = historyFormatFilter === 'all' || entry.format === historyFormatFilter
    return matchesSearch && matchesLevel && matchesFormat
  })

  // Dashboard recent history
  const recentHistory = displayHistory.slice(0, 6)

  // Points percentage for progress bar
  const pointsPercentage = Math.min(100, (points / 500) * 100)

  // Render Dashboard
  function renderDashboard() {
    return (
      <div className="space-y-6">
        {/* Welcome + Points */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="shadow-md">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <FaGraduationCap className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Bem-vindo ao EduIA</h2>
                  <p className="text-sm text-muted-foreground">Sua plataforma de conteudo academico</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Gere trabalhos academicos completos com introducao, desenvolvimento, conclusao e referencias.
                Escolha o nivel, formato e numero de paginas desejado.
              </p>
              <Button onClick={startNewWork} className="w-full mt-4 shadow-sm">
                <FiPlus className="w-4 h-4 mr-2" />
                Novo Trabalho
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-md">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-foreground">Seus Pontos</h3>
                <FaCoins className="w-5 h-5 text-primary" />
              </div>
              <p className="text-3xl font-bold text-foreground mb-1">{points.toLocaleString('pt-BR')}</p>
              <p className="text-xs text-muted-foreground mb-3">pontos disponiveis</p>
              <Progress value={pointsPercentage} className="h-2 mb-3" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{Math.floor(points / POINTS_PER_GENERATION)} trabalhos restantes</span>
                <span>{POINTS_PER_GENERATION} pts/trabalho</span>
              </div>
              {points < 150 && (
                <div className="mt-3 p-2 bg-destructive/10 rounded-lg flex items-center gap-2">
                  <FiAlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                  <p className="text-xs text-destructive">Seus pontos estao acabando!</p>
                </div>
              )}
              <Button variant="outline" onClick={() => setShowBuyModal(true)} className="w-full mt-3">
                <FiShoppingCart className="w-4 h-4 mr-2" />
                Comprar Pontos
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Purchase success message */}
        {purchaseSuccess && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
            <FiCheck className="w-4 h-4 text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-700">{purchaseSuccess}</p>
          </div>
        )}

        {/* Recent History */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-foreground">Trabalhos Recentes</h3>
            {recentHistory.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => navigateTo('history')} className="text-xs">
                Ver todos
                <FiChevronDown className="w-3 h-3 ml-1" />
              </Button>
            )}
          </div>

          {recentHistory.length === 0 ? (
            <Card className="shadow-md">
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <FaFileAlt className="w-7 h-7 text-muted-foreground" />
                </div>
                <h4 className="text-sm font-medium text-foreground mb-1">Nenhum trabalho ainda</h4>
                <p className="text-xs text-muted-foreground mb-4">Comece gerando seu primeiro conteudo academico</p>
                <Button onClick={startNewWork} size="sm">
                  <FiPlus className="w-3.5 h-3.5 mr-1.5" />
                  Criar Primeiro Trabalho
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {recentHistory.map(entry => (
                <Card key={entry.id} className="shadow-md hover:shadow-lg transition-shadow duration-200 cursor-pointer" onClick={() => { setExpandedHistoryId(entry.id); navigateTo('history') }}>
                  <CardContent className="p-4">
                    <h4 className="text-sm font-medium text-foreground truncate">{entry.topic || 'Sem titulo'}</h4>
                    <div className="flex items-center gap-1.5 mt-2">
                      <Badge variant="secondary" className="text-xs">{entry.level}</Badge>
                      <Badge variant="outline" className="text-xs">
                        {entry.format === 'slides' ? 'Slides' : 'Doc'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-muted-foreground">{entry.date}</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <FaCoins className="w-2.5 h-2.5" />
                        {entry.pointCost} pts
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Agent Status */}
        <AgentStatusSection isActive={activeAgentId !== null} />
      </div>
    )
  }

  // Render Chat
  function renderChat() {
    return (
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Chat header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigateTo('dashboard')} className="h-8 w-8 p-0">
              <FiChevronLeft className="w-4 h-4" />
            </Button>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Novo Trabalho</h2>
              <p className="text-xs text-muted-foreground">Descreva o conteudo que deseja gerar</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PointsBadge points={points} onClick={() => setShowBuyModal(true)} />
            <Button variant="outline" size="sm" onClick={startNewWork} className="text-xs h-8">
              <FiPlus className="w-3.5 h-3.5 mr-1" />
              Novo
            </Button>
          </div>
        </div>

        {/* Points warning */}
        {points < 150 && points >= POINTS_PER_GENERATION && (
          <div className="mx-4 mt-2 p-2 bg-destructive/10 rounded-lg flex items-center gap-2">
            <FiAlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
            <p className="text-xs text-destructive">Pontos baixos! Restam {Math.floor(points / POINTS_PER_GENERATION)} geracoes.</p>
            <Button variant="ghost" size="sm" className="text-xs h-6 ml-auto text-destructive" onClick={() => setShowBuyModal(true)}>
              Comprar
            </Button>
          </div>
        )}

        {/* Chat messages */}
        <ScrollArea className="flex-1 p-4">
          {messages.length === 0 && !isGenerating && (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <IoSparkles className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-2">Como posso ajudar?</h3>
              <p className="text-sm text-muted-foreground max-w-md mb-6 leading-relaxed">
                Descreva o trabalho academico que precisa. Informe o tema, nivel academico
                (fundamental, medio, tecnico ou faculdade), formato (documento ou slides)
                e numero de paginas desejado.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
                {[
                  'Trabalho sobre a Revolucao Francesa para ensino medio, 8 paginas',
                  'Apresentacao de slides sobre fotossintese para fundamental, 10 slides',
                  'Artigo sobre inteligencia artificial para faculdade, 15 paginas',
                  'Trabalho tecnico sobre redes de computadores, 10 paginas'
                ].map((suggestion, idx) => (
                  <button key={idx} onClick={() => { setInputValue(suggestion) }} className="text-left p-3 rounded-lg border border-border bg-card hover:bg-secondary transition-colors text-xs text-foreground leading-relaxed">
                    {suggestion}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1">
                <FaCoins className="w-3 h-3" />
                Cada geracao custa {POINTS_PER_GENERATION} pontos
              </p>
            </div>
          )}

          {messages.map(msg => (
            <ChatBubble key={msg.id} message={msg} onCopy={handleCopyMessage} />
          ))}

          {isGenerating && <TypingIndicator />}

          <div ref={chatEndRef} />
        </ScrollArea>

        {/* Success/Error messages */}
        {chatSuccess && (
          <div className="mx-4 mb-2 p-2 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
            <FiCheck className="w-4 h-4 text-green-600 flex-shrink-0" />
            <p className="text-xs text-green-700">{chatSuccess}</p>
          </div>
        )}
        {chatError && (
          <div className="mx-4 mb-2 p-2 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2">
            <FiAlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
            <p className="text-xs text-destructive flex-1">{chatError}</p>
            <Button variant="ghost" size="sm" className="text-xs h-6 text-destructive" onClick={() => setChatError('')}>
              Fechar
            </Button>
          </div>
        )}

        {/* Input area */}
        <div className="p-4 border-t border-border bg-card">
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Descreva o trabalho academico que deseja gerar..."
              disabled={isGenerating}
              className="flex-1 bg-background"
            />
            <Button
              onClick={sendMessage}
              disabled={!inputValue.trim() || isGenerating}
              size="sm"
              className="h-10 w-10 p-0 flex-shrink-0"
            >
              {isGenerating ? (
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                <FiSend className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Render History
  function renderHistory() {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Historico de Trabalhos</h2>
          <span className="text-sm text-muted-foreground">{filteredHistory.length} trabalho(s)</span>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Buscar por tema..."
              className="pl-9 bg-background"
            />
          </div>
          <Select value={historyLevelFilter} onValueChange={setHistoryLevelFilter}>
            <SelectTrigger className="w-full sm:w-[140px] bg-background">
              <SelectValue placeholder="Nivel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Niveis</SelectItem>
              <SelectItem value="Fundamental">Fundamental</SelectItem>
              <SelectItem value="Medio">Medio</SelectItem>
              <SelectItem value="Tecnico">Tecnico</SelectItem>
              <SelectItem value="Faculdade">Faculdade</SelectItem>
            </SelectContent>
          </Select>
          <Select value={historyFormatFilter} onValueChange={setHistoryFormatFilter}>
            <SelectTrigger className="w-full sm:w-[140px] bg-background">
              <SelectValue placeholder="Formato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Formatos</SelectItem>
              <SelectItem value="documento">Documento</SelectItem>
              <SelectItem value="slides">Slides</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* History list */}
        {filteredHistory.length === 0 ? (
          <Card className="shadow-md">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <FiClock className="w-7 h-7 text-muted-foreground" />
              </div>
              <h4 className="text-sm font-medium text-foreground mb-1">
                {historySearch || historyLevelFilter !== 'all' || historyFormatFilter !== 'all'
                  ? 'Nenhum resultado encontrado'
                  : 'Historico vazio'}
              </h4>
              <p className="text-xs text-muted-foreground mb-4">
                {historySearch || historyLevelFilter !== 'all' || historyFormatFilter !== 'all'
                  ? 'Tente ajustar os filtros de busca'
                  : 'Seus trabalhos gerados aparecerao aqui'}
              </p>
              {!historySearch && historyLevelFilter === 'all' && historyFormatFilter === 'all' && (
                <Button onClick={startNewWork} size="sm">
                  <FiPlus className="w-3.5 h-3.5 mr-1.5" />
                  Criar Primeiro Trabalho
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredHistory.map(entry => (
              <HistoryCard
                key={entry.id}
                entry={entry}
                onExpand={handleExpandHistory}
                expanded={expandedHistoryId === entry.id}
              />
            ))}
          </div>
        )}

        {/* Agent Status */}
        <AgentStatusSection isActive={activeAgentId !== null} />
      </div>
    )
  }

  // Main render
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background text-foreground font-sans">
        {/* Mobile header */}
        <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
              {mobileMenuOpen ? <FiX className="w-5 h-5" /> : <FiMenu className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-2">
              <FaGraduationCap className="w-5 h-5 text-primary" />
              <span className="font-semibold text-foreground">EduIA</span>
            </div>
          </div>
          <PointsBadge points={points} onClick={() => setShowBuyModal(true)} />
        </header>

        {/* Mobile menu overlay */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-40 bg-black/30" onClick={() => setMobileMenuOpen(false)}>
            <div className="absolute left-0 top-[53px] bottom-0 w-64 bg-card border-r border-border p-4 space-y-1" onClick={e => e.stopPropagation()}>
              <NavItem icon={<FiHome />} label="Painel" active={activeScreen === 'dashboard'} onClick={() => navigateTo('dashboard')} collapsed={false} />
              <NavItem icon={<FiMessageSquare />} label="Novo Trabalho" active={activeScreen === 'chat'} onClick={startNewWork} collapsed={false} />
              <NavItem icon={<FiClock />} label="Historico" active={activeScreen === 'history'} onClick={() => navigateTo('history')} collapsed={false} />
              <NavItem icon={<FiShoppingCart />} label="Comprar Pontos" active={false} onClick={() => navigateTo('buy')} collapsed={false} />
              <Separator className="my-3" />
              <div className="flex items-center justify-between px-3 py-2">
                <Label htmlFor="sample-toggle-mobile" className="text-xs text-muted-foreground">Sample Data</Label>
                <Switch id="sample-toggle-mobile" checked={showSampleData} onCheckedChange={setShowSampleData} />
              </div>
            </div>
          </div>
        )}

        <div className="flex">
          {/* Desktop sidebar */}
          <aside className={`hidden md:flex flex-col fixed left-0 top-0 bottom-0 z-30 bg-card border-r border-border transition-all duration-300 ${sidebarCollapsed ? 'w-16' : 'w-56'}`}>
            {/* Logo */}
            <div className={`p-4 flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-2'}`}>
              <FaGraduationCap className="w-6 h-6 text-primary flex-shrink-0" />
              {!sidebarCollapsed && <span className="text-lg font-semibold text-foreground">EduIA</span>}
            </div>

            <Separator />

            {/* Nav items */}
            <nav className="flex-1 p-3 space-y-1">
              <NavItem icon={<FiHome />} label="Painel" active={activeScreen === 'dashboard'} onClick={() => navigateTo('dashboard')} collapsed={sidebarCollapsed} />
              <NavItem icon={<FiMessageSquare />} label="Novo Trabalho" active={activeScreen === 'chat'} onClick={startNewWork} collapsed={sidebarCollapsed} />
              <NavItem icon={<FiClock />} label="Historico" active={activeScreen === 'history'} onClick={() => navigateTo('history')} collapsed={sidebarCollapsed} />
              <NavItem icon={<FiShoppingCart />} label="Comprar Pontos" active={false} onClick={() => navigateTo('buy')} collapsed={sidebarCollapsed} />
            </nav>

            {/* Bottom section */}
            <div className="p-3 space-y-2">
              <Separator />
              {!sidebarCollapsed && (
                <div className="flex items-center justify-between px-3 py-2">
                  <Label htmlFor="sample-toggle-desktop" className="text-xs text-muted-foreground cursor-pointer">Sample Data</Label>
                  <Switch id="sample-toggle-desktop" checked={showSampleData} onCheckedChange={setShowSampleData} />
                </div>
              )}
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground"
              >
                {sidebarCollapsed ? <FiMenu className="w-4 h-4" /> : <FiChevronLeft className="w-4 h-4" />}
              </button>
            </div>
          </aside>

          {/* Main content */}
          <main className={`flex-1 transition-all duration-300 min-h-screen ${sidebarCollapsed ? 'md:ml-16' : 'md:ml-56'} mt-[53px] md:mt-0`}>
            {/* Desktop header */}
            <header className="hidden md:flex items-center justify-between px-6 py-3 border-b border-border bg-card">
              <h1 className="text-base font-semibold text-foreground">
                {activeScreen === 'dashboard' && 'Painel'}
                {activeScreen === 'chat' && 'Novo Trabalho'}
                {activeScreen === 'history' && 'Historico'}
              </h1>
              <PointsBadge points={points} onClick={() => setShowBuyModal(true)} />
            </header>

            {/* Screen content */}
            <div className={activeScreen === 'chat' ? '' : 'p-4 md:p-6'}>
              {activeScreen === 'dashboard' && renderDashboard()}
              {activeScreen === 'chat' && renderChat()}
              {activeScreen === 'history' && renderHistory()}
            </div>
          </main>
        </div>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border px-2 py-1.5 flex items-center justify-around">
          <button onClick={() => navigateTo('dashboard')} className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-xs transition-colors ${activeScreen === 'dashboard' ? 'text-primary' : 'text-muted-foreground'}`}>
            <FiHome className="w-5 h-5" />
            <span>Painel</span>
          </button>
          <button onClick={startNewWork} className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-xs transition-colors ${activeScreen === 'chat' ? 'text-primary' : 'text-muted-foreground'}`}>
            <FiMessageSquare className="w-5 h-5" />
            <span>Novo</span>
          </button>
          <button onClick={() => navigateTo('history')} className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-xs transition-colors ${activeScreen === 'history' ? 'text-primary' : 'text-muted-foreground'}`}>
            <FiClock className="w-5 h-5" />
            <span>Historico</span>
          </button>
          <button onClick={() => navigateTo('buy')} className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-xs text-muted-foreground transition-colors">
            <FiShoppingCart className="w-5 h-5" />
            <span>Pontos</span>
          </button>
        </nav>

        {/* Buy Points Modal */}
        <Dialog open={showBuyModal} onOpenChange={setShowBuyModal}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FaCoins className="w-5 h-5 text-primary" />
                Comprar Pontos
              </DialogTitle>
              <DialogDescription>
                Escolha o plano ideal para suas necessidades academicas
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
              <PlanCard
                title="Basico"
                points={1000}
                price="R$5"
                perWork={`~${Math.floor(1000 / POINTS_PER_GENERATION)} trabalhos`}
                bestValue={false}
                onBuy={() => handleBuyPoints(1000)}
              />
              <PlanCard
                title="Popular"
                points={2500}
                price="R$10"
                perWork={`~${Math.floor(2500 / POINTS_PER_GENERATION)} trabalhos`}
                bestValue={false}
                onBuy={() => handleBuyPoints(2500)}
              />
              <PlanCard
                title="Premium"
                points={4000}
                price="R$25"
                perWork={`~${Math.floor(4000 / POINTS_PER_GENERATION)} trabalhos`}
                bestValue={true}
                onBuy={() => handleBuyPoints(4000)}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center mt-4">
              Ao comprar, voce concorda com os termos de uso da plataforma EduIA.
            </p>
          </DialogContent>
        </Dialog>
      </div>
    </ErrorBoundary>
  )
}
