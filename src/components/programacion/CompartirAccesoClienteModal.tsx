import React, { useState, useMemo } from 'react';
import {
  X,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Share2,
  Globe,
  Clock,
  MessageCircle,
  Sparkles,
} from 'lucide-react';
import { generarTokenAccesoCliente } from '@/api/programacionApi';
import { ModalPortal } from '@/components/ui/ModalPortal';

interface CompartirAccesoClienteModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientes: any[];
  currentClienteNombre?: string;
}

export const CompartirAccesoClienteModal: React.FC<CompartirAccesoClienteModalProps> = ({
  isOpen,
  onClose,
  clientes,
  currentClienteNombre = 'MITRE',
}) => {
  const [selectedDestinatario, setSelectedDestinatario] = useState<string>(
    currentClienteNombre || 'MITRE'
  );
  const [horasValidez, setHorasValidez] = useState<number>(8); // 8 horas por defecto (jornada laboral)
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);

  // Generar token con vencimiento
  const token = useMemo(() => {
    return generarTokenAccesoCliente({
      clienteNombre: selectedDestinatario,
      horasValidez,
    });
  }, [selectedDestinatario, horasValidez]);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '';
  const clientUrl = `${baseUrl}?app=programacion&token=${token}`;

  const mensajeWhatsApp = `*Planilla de Programación de Entregas - OpenWMS 3PL*\n\nHola *${selectedDestinatario}*, te compartimos el enlace seguro para consultar en tiempo real el estado de tus pedidos, rollos y documentos adjuntos (remitos y conformes):\n\n🔗 ${clientUrl}\n\n⏱️ _Este enlace es de sólo lectura y tiene una vigencia de ${horasValidez} horas._`;

  if (!isOpen) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(clientUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyMsg = () => {
    navigator.clipboard.writeText(mensajeWhatsApp);
    setCopiedMsg(true);
    setTimeout(() => setCopiedMsg(false), 2500);
  };

  const handleEnviarWhatsApp = () => {
    const encoded = encodeURIComponent(mensajeWhatsApp);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
  };

  const handleOpenClientView = () => {
    window.open(clientUrl, '_blank');
  };

  return (
    <ModalPortal onClose={onClose}>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-white dark:bg-[#1a1919] border border-slate-300 dark:border-[#333333] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-[#2a2a2a] bg-slate-50 dark:bg-[#1e1d1d]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Dar Acceso Seguro por WhatsApp
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Enlace con token de vencimiento automático para clientes
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 text-xs">
          {/* Destinatario Selector */}
          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
              Destinatario / Cliente a compartir:
            </label>
            <select
              value={selectedDestinatario}
              onChange={(e) => setSelectedDestinatario(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#242424] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            >
              <option value="MITRE">MITRE (Destinatario)</option>
              <option value="LAVALLE">LAVALLE</option>
              <option value="LINIK">LINIK</option>
              <option value="JPAN (CELINA)">JPAN (CELINA)</option>
              <option value="JAIME SALEM">JAIME SALEM</option>
              <option value="FLOWER TIME">FLOWER TIME</option>
              <option value="HUBER">HUBER</option>
              <option value="NICARRABLA">NICARRABLA</option>
              <option value="OMEPETEX">OMEPETEX</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.razon_social}>
                  {c.razon_social} ({c.codigo || 'CLI'})
                </option>
              ))}
            </select>
          </div>

          {/* Vencimiento / Expiración del Token */}
          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                Vigencia del Token de Acceso:
              </span>
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                Expira en {horasValidez} horas
              </span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: '4 horas', value: 4 },
                { label: '8 horas (Día)', value: 8 },
                { label: '24 horas', value: 24 },
                { label: '48 horas', value: 48 },
              ].map((dur) => (
                <button
                  key={dur.value}
                  type="button"
                  onClick={() => setHorasValidez(dur.value)}
                  className={`py-1.5 px-2 rounded-lg border text-center font-bold text-[11px] transition-all ${
                    horasValidez === dur.value
                      ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                      : 'border-slate-200 dark:border-[#333333] hover:bg-slate-50 dark:hover:bg-[#252525] text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {dur.label}
                </button>
              ))}
            </div>
          </div>

          {/* Vista previa del mensaje */}
          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
              Mensaje preparado para WhatsApp:
            </label>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#181717] border border-slate-200 dark:border-[#333333] font-mono text-[11px] text-slate-700 dark:text-slate-300 space-y-1 select-all">
              <p>
                *Planilla de Programación de Entregas - OpenWMS 3PL*
              </p>
              <p>
                Hola *{selectedDestinatario}*, te compartimos el enlace seguro para consultar tus pedidos y rollos:
              </p>
              <p className="text-emerald-600 dark:text-emerald-400 break-all font-bold">
                {clientUrl}
              </p>
              <p className="text-[10px] text-slate-500 italic">
                ⏱️ Este enlace es de sólo lectura y tiene una vigencia de {horasValidez} horas.
              </p>
            </div>
          </div>

          {/* Botones de acción principales */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              onClick={handleEnviarWhatsApp}
              className="py-2.5 px-4 rounded-xl font-bold bg-[#25D366] hover:bg-[#20bd5a] text-white shadow-md flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <MessageCircle className="w-4 h-4" />
              Enviar por WhatsApp
            </button>

            <button
              onClick={handleCopyMsg}
              className={`py-2.5 px-4 rounded-xl font-bold border transition-all flex items-center justify-center gap-2 ${
                copiedMsg
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-slate-100 dark:bg-[#252525] hover:bg-slate-200 dark:hover:bg-[#303030] text-slate-800 dark:text-slate-200 border-slate-300 dark:border-[#3a3939]'
              }`}
            >
              {copiedMsg ? (
                <>
                  <Check className="w-4 h-4" /> ¡Mensaje Copiado!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" /> Copiar Mensaje
                </>
              )}
            </button>
          </div>

          {/* Enlace directo y vista previa */}
          <div className="pt-2 border-t border-slate-200 dark:border-[#2a2a2a] flex items-center justify-between text-[11px]">
            <button
              onClick={handleCopyLink}
              className="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 font-semibold flex items-center gap-1"
            >
              <Copy className="w-3.5 h-3.5" />
              {copiedLink ? '¡Enlace copiado!' : 'Copiar solo el enlace web'}
            </button>

            <button
              onClick={handleOpenClientView}
              className="text-purple-600 dark:text-purple-400 hover:text-purple-700 font-bold flex items-center gap-1"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Probar Vista Cliente
            </button>
          </div>

          {/* Indicación de seguridad */}
          <div className="p-2.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>Acceso Protegido:</strong> El destinatario solo verá sus propios pedidos, no podrá editar estados ni borrar información.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-slate-200 dark:border-[#2a2a2a] bg-slate-50 dark:bg-[#1e1d1d]">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#252525] rounded-lg transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
};
