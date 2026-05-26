const DB_NAME = 'Chat'
const STORE_GRUPOS = 'grupos'
const STORE_MENSAJES = 'mensajes'

export default class chatBD {
	constructor() {
		// Guardaremos la conexión aquí para usarla en todos los métodos
		this.db = null
	}

	/**
	 * INIT: Configura y abre la conexión.
	 * Es fundamental porque IndexedDB es una base de datos asíncrona.
	 */
	async init() {
		return new Promise((resolve, reject) => {
			// Abrimos la DB. Versión 2 para añadir store de mensajes.
			const request = indexedDB.open(DB_NAME, 2)

			// Este evento ocurre SOLO la primera vez o cuando subes la versión.
			// Es el lugar para definir la estructura de las tablas.
			request.onupgradeneeded = (e) => {
				const db = e.target.result
				if (!db.objectStoreNames.contains(STORE_GRUPOS)) {
					db.createObjectStore(STORE_GRUPOS, { keyPath: 'id', autoIncrement: false })
				}
				if (!db.objectStoreNames.contains(STORE_MENSAJES)) {
					db.createObjectStore(STORE_MENSAJES, { keyPath: 'chatId', autoIncrement: false })
				}
				console.log('Estructura de la base de datos actualizada')
			}

			// Si la conexión es exitosa, guardamos el objeto de la DB.
			request.onsuccess = (e) => {
				this.db = e.target.result
				resolve()
			}

			// Atrapa errores (ej. si el usuario bloquea el almacenamiento local).
			request.onerror = (e) => {
				reject(`Error crítico: ${e.target.error.message}`)
			}
		})
	}

	/**
	 * CREATE: Guarda un nuevo objeto.
	 */
	async add(id, integrantes) {
		try {
			// Creamos una transacción de 'readwrite' (lectura y escritura).
			const tx = this.db.transaction(STORE_GRUPOS, 'readwrite')
			const store = tx.objectStore(STORE_GRUPOS)
			
			return new Promise((resolve, reject) => {
				// .put() crea o actualiza el registro con la misma clave primaria.
				const request = store.put({id, integrantes})
				
				request.onsuccess = () => resolve(request.result) // Retorna el nuevo ID.
				request.onerror = () => reject("No se pudo añadir el grupo")
			})
		} catch (err) {
			console.error("Error en add:", err)
		}
	}

	/**
	 * READ: Trae todos los datos del almacén.
	 */
	async getAll() {
		try {
			// Usamos 'readonly' porque solo vamos a consultar datos.
			const tx = this.db.transaction(STORE_GRUPOS, 'readonly')
			const store = tx.objectStore(STORE_GRUPOS)
			
			return new Promise((resolve) => {
				const request = store.getAll()
				// request.result será un array con todos los objetos encontrados.
				request.onsuccess = () => resolve(request.result)
			})
		} catch (err) {
			console.error("Error en getAll:", err)
			return []
		}
	}

	/**
	 * UPDATE: Modifica los integrantes de un grupo existente.
	 */
	async update(id, nuevosIntegrantes) {
		try {
			const tx = this.db.transaction(STORE_GRUPOS, 'readwrite')
			const store = tx.objectStore(STORE_GRUPOS)
			
			return new Promise((resolve, reject) => {
				// .put() actualiza el registro con la misma clave primaria.
				const request = store.put({ id, integrantes: nuevosIntegrantes })
				request.onsuccess = () => resolve()
				request.onerror = () => reject("Error al actualizar")
			})
		} catch (err) {
			console.error("Error en update:", err)
		}
	}

	/**
	 * DELETE: Elimina por clave primaria.
	 */
	async delete(id) {
		try {
			const tx = this.db.transaction(STORE_GRUPOS, 'readwrite')
			const store = tx.objectStore(STORE_GRUPOS)
			
			return new Promise((resolve) => {
				// Borramos el objeto que coincida con el ID numérico.
				const request = store.delete(id)
				request.onsuccess = () => resolve()
			})
		} catch (err) {
			console.error("Error en delete:", err)
		}
	}

	/**
	 * CLEAR: Vacía todo el contenido sin borrar la base de datos.
	 */
	async clearAll() {
		try {
			const tx = this.db.transaction(STORE_GRUPOS, 'readwrite')
			const store = tx.objectStore(STORE_GRUPOS)
			
			return new Promise((resolve, reject) => {
				const request = store.clear()
				request.onsuccess = () => resolve()
				request.onerror = () => reject("Error al limpiar")
			})
		} catch (err) {
			console.error("Error en clearAll:", err)
		}
	}
	/**
	 * GUARDAR MENSAJE: Añade un mensaje a un chat específico.
	 */
	async addMensaje(chatId, mensaje) {
		try {
			const tx = this.db.transaction(STORE_MENSAJES, 'readwrite')
			const store = tx.objectStore(STORE_MENSAJES)
			
			return new Promise((resolve, reject) => {
				// Primero obtener mensajes existentes
				const getRequest = store.get(chatId)
				getRequest.onsuccess = () => {
					const mensajes = getRequest.result ? getRequest.result.mensajes : []
					mensajes.push(mensaje)
					const putRequest = store.put({ chatId, mensajes })
					putRequest.onsuccess = () => resolve()
					putRequest.onerror = () => reject("Error al guardar mensaje")
				}
				getRequest.onerror = () => reject("Error al obtener mensajes")
			})
		} catch (err) {
			console.error("Error en addMensaje:", err)
		}
	}

	/**
	 * OBTENER MENSAJES: Trae todos los mensajes de un chat.
	 */
	async getMensajes(chatId) {
		try {
			const tx = this.db.transaction(STORE_MENSAJES, 'readonly')
			const store = tx.objectStore(STORE_MENSAJES)
			
			return new Promise((resolve) => {
				const request = store.get(chatId)
				request.onsuccess = () => resolve(request.result ? request.result.mensajes : [])
			})
		} catch (err) {
			console.error("Error en getMensajes:", err)
			return []
		}
	}}