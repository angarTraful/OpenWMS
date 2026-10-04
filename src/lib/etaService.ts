/**
 * Servicio de Cálculo de Tiempos Estimados de Arribo (ETA)
 * para Hojas de Ruta y Paradas de Reparto
 */

export interface ParadaEtaInfo {
  paradaId: string;
  secuencia: number;
  isCompleted: boolean;
  estadoEntrega: 'pendiente' | 'entregado' | 'con_novedad';
  horaRealArribo?: string | null;
  etaHoraTexto: string; // ej: "11:45"
  minutosRestantes: number; // minutos desde ahora
  minutosRestantesTexto: string; // ej: "en ~15 min" o "en ~1h 20m"
  esProxima: boolean;
}

export interface RutaEtaSummary {
  proximaParada: ParadaEtaInfo | null;
  totalParadas: number;
  paradasCompletadas: number;
  paradasPendientes: number;
  tiempoTotalRestanteTexto: string;
  paradasMap: Map<string, ParadaEtaInfo>;
}

export function calcularEtasRuta(
  paradas: any[],
  fechaSalidaReal?: string | null,
  fechaSalidaEstimada?: string | null,
  minutosPromedioPorParada: number = 25
): RutaEtaSummary {
  const paradasOrdenadas = [...(paradas || [])].sort(
    (a, b) => (a.secuencia_parada || 0) - (b.secuencia_parada || 0)
  );

  const total = paradasOrdenadas.length;
  let completadas = 0;
  let ultimaHoraCompletada: Date | null = null;

  // Determinar última parada completada
  for (const p of paradasOrdenadas) {
    if (p.estado_entrega === 'entregado' || p.estado_entrega === 'con_novedad') {
      completadas++;
      if (p.hora_real_arribo) {
        const d = new Date(p.hora_real_arribo);
        if (!isNaN(d.getTime())) {
          ultimaHoraCompletada = d;
        }
      }
    }
  }

  // Base de tiempo para paradas pendientes
  const ahora = new Date();
  let baseTime = ahora;
  if (ultimaHoraCompletada) {
    // Si la última entrega fue reciente, proyectar desde ahí o desde ahora
    baseTime = ultimaHoraCompletada.getTime() > ahora.getTime() ? ultimaHoraCompletada : ahora;
  } else if (fechaSalidaReal) {
    const dSalida = new Date(fechaSalidaReal);
    if (!isNaN(dSalida.getTime()) && dSalida.getTime() > ahora.getTime()) {
      baseTime = dSalida;
    }
  }

  const paradasMap = new Map<string, ParadaEtaInfo>();
  let pendingCounter = 0;
  let proximaParada: ParadaEtaInfo | null = null;

  paradasOrdenadas.forEach((p) => {
    const isCompleted = p.estado_entrega === 'entregado' || p.estado_entrega === 'con_novedad';

    if (isCompleted) {
      let horaTexto = 'Completado';
      if (p.hora_real_arribo) {
        try {
          const d = new Date(p.hora_real_arribo);
          horaTexto = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        } catch {}
      }

      paradasMap.set(p.id, {
        paradaId: p.id,
        secuencia: p.secuencia_parada,
        isCompleted: true,
        estadoEntrega: p.estado_entrega,
        horaRealArribo: p.hora_real_arribo,
        etaHoraTexto: horaTexto,
        minutosRestantes: 0,
        minutosRestantesTexto: 'Completado',
        esProxima: false,
      });
    } else {
      pendingCounter++;
      // Sumar tiempo acumulado por cada parada en cola
      const offsetMs = pendingCounter * minutosPromedioPorParada * 60 * 1000;
      const etaDate = new Date(baseTime.getTime() + offsetMs);
      const diffMs = etaDate.getTime() - ahora.getTime();
      const diffMins = Math.max(1, Math.round(diffMs / 60000));

      const horaTexto = `${String(etaDate.getHours()).padStart(2, '0')}:${String(etaDate.getMinutes()).padStart(2, '0')}`;
      let minsTexto = `en ~${diffMins} min`;
      if (diffMins >= 60) {
        const hs = Math.floor(diffMins / 60);
        const minsRest = diffMins % 60;
        minsTexto = minsRest > 0 ? `en ~${hs}h ${minsRest}m` : `en ~${hs}h`;
      }

      const esProxima = pendingCounter === 1;
      const info: ParadaEtaInfo = {
        paradaId: p.id,
        secuencia: p.secuencia_parada,
        isCompleted: false,
        estadoEntrega: 'pendiente',
        horaRealArribo: null,
        etaHoraTexto: horaTexto,
        minutosRestantes: diffMins,
        minutosRestantesTexto: minsTexto,
        esProxima,
      };

      paradasMap.set(p.id, info);
      if (esProxima) {
        proximaParada = info;
      }
    }
  });

  const pendientes = total - completadas;
  const totalMinutosRestantes = pendientes * minutosPromedioPorParada;
  let tiempoTotalRestanteTexto = `${totalMinutosRestantes} min`;
  if (totalMinutosRestantes >= 60) {
    const hs = Math.floor(totalMinutosRestantes / 60);
    const m = totalMinutosRestantes % 60;
    tiempoTotalRestanteTexto = m > 0 ? `${hs}h ${m}m` : `${hs}h`;
  }

  return {
    proximaParada,
    totalParadas: total,
    paradasCompletadas: completadas,
    paradasPendientes: pendientes,
    tiempoTotalRestanteTexto,
    paradasMap,
  };
}
