import React, { useState, useEffect, useRef } from 'react';
import { Send, User, MessageCircle, Globe, Layout, ArrowRight, MessageSquare, Check, CheckCheck, LogOut, Plus, Users } from 'lucide-react';
import chatBD from './chatDB';

const App = () => {
  const [db, setDb] = useState(null);
  const [socket, setSocket] = useState(null);
  const [nombre, setNombre] = useState('');
  const [conectado, setConectado] = useState(false);
  const [usuarios, setUsuarios] = useState([]);
  const [mensajes, setMensajes] = useState([]);
  const [mensajesCargados, setMensajesCargados] = useState(new Set()); 
  const [inputMensaje, setInputMensaje] = useState('');
  const [receptor, setReceptor] = useState(null);
  const [noLeidos, setNoLeidos] = useState({}); 
  const [grupos, setGrupos] = useState([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [mostrarCrearGrupo, setMostrarCrearGrupo] = useState(false);
  const [mostrarAgregarMiembros, setMostrarAgregarMiembros] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const dbInitPromise = useRef(null);
  const messagesEndRef = useRef(null);

  const receptorRef = useRef(null);
  useEffect(() => { receptorRef.current = receptor; }, [receptor]);

  const agregarGrupoLocal = (grupo) => {
    setGrupos(prev => {
      if (prev.some(g => g.id === grupo.id))
        return prev.map(g => g.id === grupo.id ? grupo : g)
      return [...prev, grupo]
    })
  }

  const getConversationId = (otherUser, groupId = null) => {
    if (groupId) return groupId
    const pair = [nombre, otherUser].sort().join('|')
    return `private:${pair}`
  }

  const ordenarMensajes = (mensajesArray) => {
    return [...mensajesArray].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
  }

  const crearGrupo = async (id, integrantes) => {
    const grupo = { id, integrantes }
    agregarGrupoLocal(grupo)
    if (db) {
      try {
        await db.add(id, integrantes)
      } catch (error) {
        console.error('Error guardando grupo en DB:', error)
      }
    }
    return grupo
  }

  const actualizarGrupo = async (id, integrantes) => {
    const grupo = { id, integrantes }
    agregarGrupoLocal(grupo)
    if (db) {
      try {
        await db.update(id, integrantes)
      } catch (error) {
        console.error('Error actualizando grupo en DB:', error)
      }
    }
    return grupo
  }

  const crearGrupoDesdeUI = async () => {
    const id = newGroupName.trim()
    if (!id) return alert('Escribe un nombre de grupo válido')
    if (!selectedMembers.length) return alert('Selecciona al menos un integrante')
    if (grupos.some(g => g.id === id)) return alert('Ya existe un grupo con ese nombre')

    const integrantes = [nombre, ...selectedMembers].filter(Boolean)
    const grupo = await crearGrupo(id, integrantes) //objeto creado

    if (socket?.readyState === WebSocket.OPEN) {
      const destinatarios = grupo.integrantes.filter(u => u !== nombre)
      if (destinatarios.length) {
        socket.send(JSON.stringify({
          mensaje: 'GRUPO_CREAR',
          data: { id: grupo.id, integrantes: grupo.integrantes }
        }))
      }
    }

    setNewGroupName('')
    setSelectedMembers([])
    setReceptor(id)
  }

  const actualizarGrupoDesdeUI = async (nuevoMiembro) => {
    const grupo = grupos.find(g => g.id === receptor)
    if (!grupo) return
    if (grupo.integrantes.includes(nuevoMiembro)) return

    const integrantes = [...grupo.integrantes, nuevoMiembro]
    await actualizarGrupo(receptor, integrantes)

    if (socket?.readyState === WebSocket.OPEN) {
      const destinatarios = integrantes.filter(u => u !== nombre)
      if (destinatarios.length) {
        socket.send(JSON.stringify({
          mensaje: 'GRUPO_ACTUALIZAR',
          data: { id: receptor, integrantes }
        }))
      }
    }
  }

  const cargarMensajesChat = async (chatId) => {
    if (!db || mensajesCargados.has(chatId)) return
    try {
      const mensajesGuardados = await db.getMensajes(chatId)
      setMensajes(prev => {
        const existentes = new Set(prev.filter(m => m.chatId === chatId).map(m => m.id))
        const nuevos = mensajesGuardados.filter(m => !existentes.has(m.id))
        return ordenarMensajes([...prev, ...nuevos])
      })
      setMensajesCargados(prev => new Set([...prev, chatId]))
    } catch (error) {
      console.error('Error cargando mensajes:', error)
    }
  }

  const colors = {
    primario: '#630d16',
    secundario: '#FF9E6D',
    visto: '#4FC3F7',
    fondo: '#F4F7F6',
    blanco: '#FFFFFF',
    texto: '#2C3E50',
    notificacion: '#E74C3C'
  };

  const soyCarlos = nombre === 'chatCarlosTodos';
  const chatIdActual = receptor ? (grupos.some(g => g.id === receptor) ? receptor : getConversationId(receptor)) : null

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [mensajes]);

  const inicializarDB = async () => {
    if (dbReady) return;
    if (dbInitPromise.current) return dbInitPromise.current;

    dbInitPromise.current = (async () => {
      const instanciaBD = new chatBD();
      try {
        await instanciaBD.init();
        setDb(instanciaBD);
        setDbReady(true);
        console.log("IndexedDB lista para usar");
        
        // Cargar grupos guardados al iniciar
        const gruposGuardados = await instanciaBD.getAll();
        setGrupos(gruposGuardados || []);
        console.log("Grupos en BD:", gruposGuardados);
        
        // Cargar mensajes de chats privados y grupos
        const chatsParaCargar = ['chatCarlosTodos'];
        gruposGuardados.forEach(g => chatsParaCargar.push(g.id));
        // Para privados, no sabemos cuáles, así que cargamos al seleccionar
        
        for (const chatId of chatsParaCargar) {
          const mensajesChat = await instanciaBD.getMensajes(chatId);
          if (mensajesChat.length) {
            setMensajes(prev => {
              const existentes = new Set(prev.filter(m => m.chatId === chatId).map(m => m.id))
              const nuevos = mensajesChat.filter(m => !existentes.has(m.id))
              return ordenarMensajes([...prev, ...nuevos])
            })
            setMensajesCargados(prev => new Set([...prev, chatId]));
          }
        }
      } catch (error) {
        console.error(error);
      }
    })();

    return dbInitPromise.current;
  }

//Inicialización de IndexedDB
  useEffect(() => {
    inicializarDB();
  }, []);

  useEffect(() => {
    if (!nombre || !dbReady) return;
    const filtrarGrupos = async () => {
      try {
        const gruposGuardados = await db.getAll();
        const gruposFiltrados = gruposGuardados.filter(g => Array.isArray(g.integrantes) && g.integrantes.includes(nombre));
        setGrupos(gruposFiltrados);
      } catch (error) {
        console.error('Error filtrando grupos por nombre:', error);
      }
    };
    filtrarGrupos();
  }, [nombre, dbReady]);

  useEffect(() => {
    if (!db || !grupos.length) return;
    const persistirGrupos = async () => {
      for (const grupo of grupos) {
        try {
          await db.update(grupo.id, grupo.integrantes)
        } catch (error) {
          try {
            await db.add(grupo.id, grupo.integrantes)
          } catch (err) {
            // ignore si ya existe o falla
          }
        }
      }
    }
    persistirGrupos();
  }, [db, grupos]);

  useEffect(() => {
    if (!db || !receptor) return;
    cargarMensajesChat(chatIdActual)
  }, [db, receptor, chatIdActual]);

  // Intervalo para actualizar lista de conectados
  useEffect(() => {
    let intervalo = null;
    if (conectado && socket) {
      intervalo = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ mensaje: 'CONECTADOS', data: {} }));
        }
      }, 2000);
    }
    return () => { if (intervalo) clearInterval(intervalo); };
  }, [conectado, socket]);

  const conectar = async () => {
    if (!nombre.trim()) return alert("Por favor, ingresa tu nombre");
    if (!dbReady) await inicializarDB();
    const ws = new WebSocket('ws://localhost:8080');

    ws.onopen = () => {
      setConectado(true);
      ws.send(JSON.stringify({ mensaje: 'IDENTIFICACION', data: nombre }));
      if (nombre === 'chatCarlosTodos') setReceptor('chatCarlosTodos');
    };

    ws.onmessage = async (e) => {
      const { mensaje, data } = JSON.parse(e.data);
      
      if (mensaje === 'IDENTIFICATE') ws.send(JSON.stringify({ mensaje: 'IDENTIFICACION', data: nombre }));
      if (mensaje === 'CONECTADOS') setUsuarios(data);

      if (mensaje === 'GRUPO_CREAR' || mensaje === 'GRUPO_ACTUALIZAR') {
        if (!data || !data.id || !Array.isArray(data.integrantes)) return;
        if (!data.integrantes.includes(nombre)) return;

        const grupo = { id: data.id, integrantes: data.integrantes };
        await (mensaje === 'GRUPO_CREAR' ? crearGrupo(data.id, data.integrantes) : actualizarGrupo(data.id, data.integrantes));
        return;
      }
      
      if (mensaje === 'CHAT') {
        // 1. Detectar si es una confirmación de lectura [VISTO]
        if (data.mensaje.startsWith('[VISTO]')) {
          const idMensajeVisto = data.mensaje.replace('[VISTO]', '');
          setMensajes(prev => prev.map(m => m.id === idMensajeVisto ? { ...m, visto: true } : m));
          return; // No mostramos este mensaje en el chat
        }

        if (data.emisor === nombre) return;

        const esGrupal = !!data.grupo || data.mensaje.startsWith('[G]');
        const grupoId = data.grupo || (data.mensaje.startsWith('[G]') ? 'chatCarlosTodos' : null);
        const textoLimpio = esGrupal ? data.mensaje.replace('[G]', '') : data.mensaje;
        const idEntrante = data.id || `m-${Date.now()}-${data.emisor}`;
        const origen = grupoId || data.emisor;

        if (soyCarlos && !esGrupal) return;

        // Manejo de notificaciones
        if (origen !== receptorRef.current) {
          setNoLeidos(prev => ({ ...prev, [origen]: (prev[origen] || 0) + 1 }));
        }

        const chatId = grupoId ? grupoId : getConversationId(data.emisor)
        const timestamp = Date.now()
        const mensajeRegistrado = {
          id: idEntrante,
          emisor: data.emisor,
          mensaje: textoLimpio,
          esGrupal,
          grupo: grupoId,
          chatConOriginal: data.emisor,
          chatId,
          timestamp,
          hora: new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          visto: false
        }

        // Agregar mensaje a la lista solo si no existe
        setMensajes(prev => {
          if (prev.some(m => m.id === mensajeRegistrado.id && m.chatId === mensajeRegistrado.chatId)) return prev
          return [...prev, mensajeRegistrado]
        })

        // Guardar mensaje recibido en DB
        if (db) {
          db.addMensaje(chatId, mensajeRegistrado);
        }

        // Visto, solo si es chat privado y tenemos el chat abierto
        if (!esGrupal && origen === receptorRef.current) {
          ws.send(JSON.stringify({
            mensaje: 'CHAT',
            data: { 
              receptor: [data.emisor], 
              mensaje: `[VISTO]${idEntrante}`,
              id: `ack-${idEntrante}` 
            }
          }));
        }
      }
    };

    ws.onclose = () => setConectado(false);
    setSocket(ws);
  };

  const seleccionarChat = (idChat) => {
    setReceptor(idChat);
    setNoLeidos(prev => ({ ...prev, [idChat]: 0 }));

    const esGrupo = grupos.some(g => g.id === idChat)
    const chatId = esGrupo ? idChat : getConversationId(idChat)
    cargarMensajesChat(chatId)

    // Al abrir un chat privado, marcamos los mensajes existentes como vistos
    const ultimosMensajes = mensajes.filter(m => !m.esGrupal && m.chatId === chatId)
    ultimosMensajes.forEach(m => {
       if(socket) {
         socket.send(JSON.stringify({
           mensaje: 'CHAT',
           data: { receptor: [idChat], mensaje: `[VISTO]${m.id}` }
         }));
       }
    });
  };

  const enviar = async (e) => {
    e.preventDefault();
    if (!inputMensaje.trim() || !receptor) return;

    const grupoSeleccionado = grupos.find(g => g.id === receptor);
    const esGrupal = receptor === 'chatCarlosTodos' || !!grupoSeleccionado;
    const listaReceptores = grupoSeleccionado
      ? grupoSeleccionado.integrantes.filter(u => u !== nombre)
      : esGrupal
        ? usuarios.filter(u => u !== nombre)
        : [receptor];

    if (!listaReceptores.length) return;

    const mensajeAEnviar = esGrupal ? `[G]${inputMensaje}` : inputMensaje;
    const idMiMensaje = `m-${Date.now()}-${nombre}`;

    const mensajeData = {
      id: idMiMensaje,
      receptor: listaReceptores,
      mensaje: mensajeAEnviar
    };

    if (grupoSeleccionado) mensajeData.grupo = receptor;
    if (receptor === 'chatCarlosTodos') mensajeData.grupo = 'chatCarlosTodos';

    socket.send(JSON.stringify({ 
      mensaje: 'CHAT', 
      data: mensajeData 
    }));
    
    const timestamp = Date.now()
    const mensajeObj = { 
      id: idMiMensaje,
      emisor: 'Yo', 
      mensaje: inputMensaje, 
      esGrupal, 
      grupo: grupoSeleccionado ? receptor : receptor === 'chatCarlosTodos' ? 'chatCarlosTodos' : null,
      chatConOriginal: receptor, 
      chatId: grupoSeleccionado ? receptor : receptor === 'chatCarlosTodos' ? 'chatCarlosTodos' : getConversationId(receptor),
      timestamp,
      hora: new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      visto: false 
    };
    
    const mensajeObjConId = mensajeObj
    setMensajes(prev => {
      if (prev.some(m => m.id === mensajeObjConId.id && m.chatId === mensajeObjConId.chatId)) return prev
      return [...prev, mensajeObjConId]
    })
    
    // Guardar mensaje en DB
    if (db) {
      await db.addMensaje(chatId, mensajeObjConId);
    }
    
    setInputMensaje('');
  };

  //Componentes de interfaz
  const NotificationBadge = ({ count }) => {
    if (!count || count <= 0) return null;
    return (
      <div style={{ background: colors.notificacion, color: 'white', fontSize: '0.7rem', fontWeight: 'bold', minWidth: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2px', marginLeft: 'auto' }}>
        {count}
      </div>
    );
  };

  // Pantalla de Login
  if (!conectado) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${colors.primario} 0%, ${colors.secundario} 100%)`, fontFamily: 'sans-serif' }}>
      <div style={{ background: 'white', padding: '50px', borderRadius: '30px', textAlign: 'center', width: '380px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ background: colors.fondo, width: '80px', height: '80px', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 25px' }}>
          <MessageCircle size={45} color={colors.primario} />
        </div>
        <h1 style={{ color: colors.texto, fontSize: '2.2rem', marginBottom: '10px', fontWeight: '800' }}>¡BIENVENIDO!</h1>
        <input 
          style={{ width: '100%', padding: '15px 20px', borderRadius: '12px', border: '2px solid #F0F3F4', marginBottom: '20px', fontSize: '1rem', outline: 'none', boxSizing: 'border-box' }} 
          placeholder="Escribe tu nombre de usuario..." 
          value={nombre} 
          onChange={e => setNombre(e.target.value)} 
          onKeyPress={(e) => e.key === 'Enter' && conectar()}
        />
        <button onClick={conectar} style={{ width: '100%', padding: '16px', borderRadius: '12px', border: 'none', background: colors.primario, color: 'white', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontSize: '1.1rem' }}>
          CONECTAR AHORA <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );

  // Pantalla de Chat Principal
  return (
    <div style={{ display: 'flex', height: '100vh', background: colors.fondo, padding: '25px', boxSizing: 'border-box', gap: '25px', fontFamily: 'sans-serif' }}>
      {/* Sidebar */}
      <div style={{ width: '300px', background: 'white', borderRadius: '25px', padding: '30px', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 25px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '40px', borderBottom: '1px solid #F0F3F4', paddingBottom: '20px', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ width: '50px', height: '50px', background: colors.primario, borderRadius: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
              <User size={24}/>
            </div>
            <div>
              <h4 style={{ margin: 0, color: colors.texto, fontSize: '1.1rem' }}>{nombre}</h4>
              <span style={{ fontSize: '0.75rem', color: '#27AE60', fontWeight: 'bold' }}>• En línea</span>
            </div>
          </div>
          <button onClick={() => { if(socket) socket.close(); setConectado(false); }} style={{ background: 'none', border: 'none', color: colors.texto, cursor: 'pointer' }}>
            <LogOut size={20} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <p style={{ fontSize: '0.7rem', color: '#BDC3C7', fontWeight: '800', marginBottom: '15px', letterSpacing: '1px' }}>CANAL GRUPAL</p>
          {/* Botón para crear grupo SIEMPRE visible y Sala de Carlos en un fragmento */}
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px' }}>
              <p style={{ fontSize: '0.7rem', color: '#BDC3C7', fontWeight: '800', letterSpacing: '1px', margin: 0 }}>GRUPOS</p>
              <button 
                onClick={() => setMostrarCrearGrupo(!mostrarCrearGrupo)} 
                style={{ background: 'none', border: 'none', color: colors.primario, cursor: 'pointer', padding: '5px', borderRadius: '5px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}
                title="Crear nuevo grupo"
              >
                <Plus size={16} />
              </button>
            </div>
            {mostrarCrearGrupo && (
              <div style={{ marginBottom: '20px', padding: '15px', borderRadius: '12px', background: '#F8F9F9', border: '1px solid #EAECEE' }}>
                <h4 style={{ margin: '0 0 10px 0', color: colors.texto, fontSize: '0.9rem' }}>Crear nuevo grupo</h4>
                <input
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  placeholder="Nombre de grupo"
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #EAECEE', outline: 'none', fontSize: '0.9rem', marginBottom: '10px' }}
                />
                <div style={{ maxHeight: '150px', overflowY: 'auto', marginBottom: '10px' }}>
                  {usuarios.filter(u => u !== nombre && u !== 'chatCarlosTodos').map((u) => (
                    <label key={u} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer', padding: '5px 0' }}>
                      <input
                        type="checkbox"
                        checked={selectedMembers.includes(u)}
                        onChange={() => {
                          setSelectedMembers(prev => prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u])
                        }}
                      />
                      {u}
                    </label>
                  ))}
                </div>
                <button
                  onClick={() => {
                    crearGrupoDesdeUI();
                    setMostrarCrearGrupo(false);
                  }}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: 'none', background: colors.primario, color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Crear grupo
                </button>
              </div>
            )}
            <button 
              onClick={() => seleccionarChat('chatCarlosTodos')} 
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '15px', borderRadius: '15px', border: 'none', background: receptor === 'chatCarlosTodos' ? colors.primario : colors.fondo, color: receptor === 'chatCarlosTodos' ? 'white' : colors.texto, cursor: 'pointer', marginBottom: '20px', fontWeight: '600' }}>
              <Globe size={20}/> <span>Sala de Carlos</span>
              <NotificationBadge count={noLeidos['chatCarlosTodos']} />
            </button>
          </>

          {grupos.length > 0 && (
            <>
              {mostrarAgregarMiembros && receptor && grupos.some(g => g.id === receptor) && (
                <div style={{ marginBottom: '20px', padding: '15px', borderRadius: '12px', background: '#F8F9F9', border: '1px solid #EAECEE' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: colors.texto, fontSize: '0.9rem' }}>Agregar miembros a {receptor}</h4>
                  <div style={{ maxHeight: '150px', overflowY: 'auto', marginBottom: '10px' }}>
                    {usuarios.filter(u => u !== nombre && u !== 'chatCarlosTodos' && !grupos.find(g => g.id === receptor)?.integrantes.includes(u)).map((u) => (
                      <button
                        key={u}
                        onClick={() => {
                          actualizarGrupoDesdeUI(u);
                          setMostrarAgregarMiembros(false);
                        }}
                        style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #EAECEE', background: 'white', color: colors.texto, cursor: 'pointer', marginBottom: '5px', textAlign: 'left', fontSize: '0.85rem' }}
                      >
                        Agregar {u}
                      </button>
                    ))}
                  </div>
                  {usuarios.filter(u => u !== nombre && u !== 'chatCarlosTodos' && !grupos.find(g => g.id === receptor)?.integrantes.includes(u)).length === 0 && (
                    <p style={{ margin: 0, color: '#7F8C8D', fontSize: '0.85rem' }}>No hay usuarios conectados fuera del grupo.</p>
                  )}
                </div>
              )}
              {grupos.filter(g => Array.isArray(g.integrantes) && g.integrantes.includes(nombre)).map((g, i) => (
                <div 
                  key={i} 
                  onClick={() => seleccionarChat(g.id)} 
                  style={{ 
                    width: '100%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '12px', 
                    padding: '12px', 
                    borderRadius: '12px', 
                    border: 'none', 
                    background: receptor === g.id ? 'rgba(99, 13, 22, 0.1)' : 'transparent', 
                    color: receptor === g.id ? colors.primario : colors.texto, 
                    cursor: 'pointer', 
                    marginBottom: '8px',
                    transition: 'all 0.2s ease',
                    boxShadow: receptor === g.id ? '0 2px 8px rgba(99, 13, 22, 0.15)' : 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (receptor !== g.id) {
                      e.target.style.background = '#F8F9F9';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (receptor !== g.id) {
                      e.target.style.background = 'transparent';
                    }
                  }}
                >
                  <div style={{ 
                    width: '35px', 
                    height: '35px', 
                    background: colors.secundario, 
                    borderRadius: '10px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    color: 'white',
                    fontSize: '0.8rem',
                    fontWeight: 'bold'
                  }}>
                    {g.id.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>{g.id}</span>
                    <span style={{ fontSize: '0.7rem', color: '#7F8C8D', marginTop: '2px' }}>
                      {g.integrantes.length} miembros
                    </span>
                  </div>
                  <NotificationBadge count={noLeidos[g.id]} />
                </div>
              ))}
            </>
          )}

          {!soyCarlos && (
            <>
              <p style={{ fontSize: '0.7rem', color: '#BDC3C7', fontWeight: '800', marginBottom: '15px', letterSpacing: '1px' }}>CONTACTOS EN LINEA</p>
              {usuarios.filter(u => u !== nombre && u !== 'chatCarlosTodos').map((u, i) => (
                <button 
                  key={i} 
                  onClick={() => seleccionarChat(u)} 
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '12px', border: 'none', background: receptor === u ? 'rgba(99, 13, 22, 0.1)' : 'transparent', color: receptor === u ? colors.primario : colors.texto, cursor: 'pointer', marginBottom: '5px' }}>
                  <span style={{ flex: 1, textAlign: 'left' }}>{u}</span>
                  <NotificationBadge count={noLeidos[u]} />
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Área de Chat */}
      <div style={{ flex: 1, background: 'white', borderRadius: '25px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.05)' }}>
        {receptor ? (
          <>
            <header style={{ padding: '20px 35px', background: 'white', borderBottom: '1px solid #F0F3F4', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ padding: '10px', background: colors.fondo, borderRadius: '12px' }}>
                  <MessageSquare size={22} color={colors.primario} />
                </div>
                <h3 style={{ margin: 0, color: colors.texto, fontSize: '1.2rem' }}>
                  {receptor === 'chatCarlosTodos' ? 'Chat Grupal (Todos)' : grupos.some(g => g.id === receptor) ? `Grupo ${receptor}` : `Chat con ${receptor}`}
                </h3>
              </div>
              {grupos.some(g => g.id === receptor) && (
                <button 
                  onClick={() => setMostrarAgregarMiembros(!mostrarAgregarMiembros)} 
                  style={{ background: 'none', border: 'none', color: colors.primario, cursor: 'pointer', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.85rem' }}
                  title="Agregar miembros"
                >
                  <Users size={18} /> Agregar
                </button>
              )}
            </header>

            <div style={{ flex: 1, padding: '30px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px', background: '#FCFDFD' }}>
              {mensajes.filter(m => {
                if (receptor === 'chatCarlosTodos') return m.grupo === 'chatCarlosTodos';
                const grupoSeleccionado = grupos.some(g => g.id === receptor);
                if (grupoSeleccionado) return m.grupo === receptor;
                return m.chatId === chatIdActual;
              }).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)).map((m, i) => (
                <div key={i} style={{ alignSelf: m.emisor === 'Yo' ? 'flex-end' : 'flex-start', maxWidth: '70%' }}>
                  <div style={{ padding: '15px 20px', borderRadius: '18px', background: m.emisor === 'Yo' ? colors.primario : colors.fondo, color: m.emisor === 'Yo' ? 'white' : colors.texto }}>
                    <b style={{ fontSize: '0.65rem', display: 'block', marginBottom: '5px', textTransform: 'uppercase', opacity: 0.8 }}>{m.emisor}</b>
                    <div style={{ fontSize: '0.95rem', lineHeight: '1.4' }}>{m.mensaje}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px', marginTop: '5px', opacity: 0.7 }}>
                      <span style={{ fontSize: '0.6rem' }}>{m.hora}</span>
                      {m.emisor === 'Yo' && !m.esGrupal && (
                        m.visto ? <CheckCheck size={13} color={colors.visto} /> : <Check size={13} color="rgba(255,255,255,0.5)" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={enviar} style={{ padding: '25px 35px', background: 'white', display: 'flex', gap: '15px' }}>
              <input 
                style={{ flex: 1, padding: '15px 20px', borderRadius: '12px', border: '1px solid #EAECEE', outline: 'none', background: '#F8F9F9', fontSize: '1rem' }} 
                value={inputMensaje} 
                onChange={e => setInputMensaje(e.target.value)} 
                placeholder="Escribe un mensaje aquí..." 
              />
              <button type="submit" style={{ background: colors.primario, color: 'white', border: 'none', width: '55px', height: '55px', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Send size={22}/>
              </button>
            </form>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#D5DBDB' }}>
            <Layout size={100} style={{ marginBottom: '20px', opacity: 0.3 }} />
            <h2 style={{ color: '#ABB2B9', fontWeight: '400' }}>Selecciona un contacto para comenzar</h2>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;