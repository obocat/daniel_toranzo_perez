---
title: "Sesión compartida entre iOS, widgets y Apple Watch: dónde encaja Keychain"
title_en: "Sharing a session across iOS, widgets, and Apple Watch: where Keychain fits"
date: 2026-11-16 00:00:00
description: "Cómo mantener la sesión entre la app, widgets y Apple Watch con Keychain compartido, WatchConnectivity e iCloud Keychain."
description_en: "How to keep a session across an app, widgets, and Apple Watch with shared Keychain, WatchConnectivity, and iCloud Keychain."
lang: es
tags: [iOS, SwiftUI, WidgetKit, watchOS, Security]
categories: blog
layout: blog
reading_time: 12
---

<div class="lang-es" lang="es" markdown="1">

La escena se repite: alguien inicia sesión en la app, abre el widget y se encuentra con un «Inicia sesión». Levanta la muñeca y en el Apple Watch, más de lo mismo. La tentación es guardar el token en un `UserDefaults` compartido y seguir adelante. Es cómodo, pero también es una mala idea: un token es una credencial y merece el mismo trato que una contraseña.

Keychain compartido ayuda, pero solo hasta cierto punto. Piensa en dos escenarios que se parecen y no son iguales: compartir un secreto **dentro del mismo dispositivo** y moverlo **de un dispositivo a otro**. Si los mezclas, acabas esperando magia del Keychain.

## Dos problemas distintos

La app y el widget viven en el mismo iPhone. Si ambos targets declaran el mismo *access group*, pueden leer y escribir el mismo item de Keychain. En el reloj, la app del Watch y sus extensiones pueden hacer lo mismo.

El iPhone y el Apple Watch ya son otra historia. Son dispositivos distintos y un access group no sincroniza nada entre ellos. Para que la sesión llegue al reloj tienes dos caminos:

| Necesidad | Mecanismo |
| --- | --- |
| App + widget en el mismo iPhone | Keychain access group |
| App + widgets/complicaciones en el Watch | Keychain access group en watchOS |
| iPhone ↔ Apple Watch | WatchConnectivity o iCloud Keychain |

En watchOS 9 o posterior, las complicaciones se construyen con WidgetKit; ClockKit está obsoleto. El mismo access group sirve para la app y sus extensiones de widget.

> **Importante:** Un Keychain access group comparte items en el mismo dispositivo. No los sincroniza entre el iPhone y el Watch.
{: .doc-callout .doc-callout--important}

Parece una diferencia menor, pero explica muchos fallos. Cuando el widget no encuentra el token, normalmente hay un entitlement mal puesto o un access group que no coincide. Cuando el que no lo encuentra es el Watch, a veces el código está bien: es que le estás pidiendo al Keychain algo que no puede hacer.

## El modelo de sesión

Para el ejemplo nos basta con una estructura `Codable` pequeña:

```swift
import Foundation
import Security

struct Session: Codable, Equatable, Sendable {
    let accessToken: String
    let expiresAt: Date
    let userID: String
}

enum SessionStoreError: Error {
    case unexpectedStatus(OSStatus)
    case invalidData
}
```

En este ejemplo, el `refreshToken` no está en el modelo compartido. La app lo guarda en un Keychain privado y el widget y el reloj solo reciben el token de acceso, que es lo que necesitan para pintar datos y hablar con la API. Es la opción de mínimo privilegio, no una prohibición absoluta: si prefieres que el reloj refresque por su cuenta, puedes compartir el mismo refresh token. En ese caso, no lo pongas en `applicationContext`; envíalo con `sendMessage` y guárdalo en el Keychain del reloj. El logout debe revocar el refresh token en el servidor siempre, compartas el token o no.

Ese tipo y el store que viene después tienen que estar disponibles en la app y en la extensión. Puedes compartirlos con un framework interno o añadir los mismos archivos a los dos targets.

> **Nota:** El `UserDefaults` de un App Group es cómodo para un identificador de usuario, una fecha de última sincronización o un flag de onboarding. No es el sitio para tokens, credenciales ni secretos.
{: .doc-callout .doc-callout--note}

## Keychain compartido entre la app y el widget

Lo primero es habilitar **Keychain Sharing** en la app y en la extensión del widget. En Xcode, añade la capability a los dos targets y apunta al mismo grupo. En los entitlements debería quedar algo así:

```xml
<key>keychain-access-groups</key>
<array>
    <string>$(AppIdentifierPrefix)com.example.shared</string>
</array>
```

Ojo con el valor que se usa en tiempo de ejecución: Xcode sustituye `$(AppIdentifierPrefix)` al compilar, así que el grupo ya lleva el Team ID. Si tu Team ID es `ABCDE12345`, el grupo real es `ABCDE12345.com.example.shared`. Si pasas el grupo sin prefijo, el Keychain no lo encuentra y puede devolver `errSecMissingEntitlement`. En el código puedes centralizarlo en una constante; en producción, mejor inyecta el valor desde el Info.plist con `$(AppIdentifierPrefix)com.example.shared` y léelo con `Bundle.main`.

```swift
// Este store solo guarda el token de acceso.
// El refreshToken vive en un grupo privado de la app.
struct SharedSessionStore {
    static let service = "com.example.session"
    static let account = "current"
    static let accessGroup = "ABCDE12345.com.example.shared"

    private static var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: accessGroup,
            kSecAttrSynchronizable as String: false
        ]
    }

    static func save(_ session: Session) throws {
        let data = try JSONEncoder().encode(session)
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]

        let status = SecItemUpdate(baseQuery as CFDictionary, attributes as CFDictionary)

        if status == errSecItemNotFound {
            var item = baseQuery
            attributes.forEach { item[$0.key] = $0.value }

            let addStatus = SecItemAdd(item as CFDictionary, nil)
            guard addStatus == errSecSuccess else {
                throw SessionStoreError.unexpectedStatus(addStatus)
            }
        } else if status != errSecSuccess {
            throw SessionStoreError.unexpectedStatus(status)
        }
    }

    static func load() throws -> Session? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)

        if status == errSecItemNotFound {
            return nil
        }

        guard status == errSecSuccess else {
            throw SessionStoreError.unexpectedStatus(status)
        }

        guard let data = item as? Data else {
            throw SessionStoreError.invalidData
        }

        return try JSONDecoder().decode(Session.self, from: data)
    }

    static func delete() throws {
        let status = SecItemDelete(baseQuery as CFDictionary)

        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw SessionStoreError.unexpectedStatus(status)
        }
    }
}
```

Dos detalles marcan la diferencia:

- `kSecAttrAccessGroup` hace que la app y el widget lean el mismo item. Sin ese atributo, cada proceso busca en su propio espacio.
- `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` permite leer el token después del primer desbloqueo, que es lo que necesita un widget en segundo plano. `WhenUnlocked` falla cuando el dispositivo está bloqueado, y `ThisDeviceOnly` evita que el item se sincronice con iCloud.

> **Importante:** Para un widget, `kSecAttrAccessibleWhenUnlocked` no es una buena opción. Si la extensión se ejecuta con el dispositivo bloqueado, la lectura puede fallar con `errSecInteractionNotAllowed`. Usa una clase accesible después del primer desbloqueo y no dependas de que el usuario tenga la pantalla desbloqueada.
{: .doc-callout .doc-callout--important}

El otro detalle es de seguridad: este `Session` solo contiene el token de acceso. El `refreshToken` se queda en un Keychain privado de la app. Si el reloj necesita refrescar por su cuenta, puedes compartir el mismo refresh token, pero envíalo solo por `sendMessage`, guárdalo en el Keychain del reloj y revócalo en el servidor al cerrar sesión.

## El widget lee, la app refresca

El widget no debería renovar el token. Los timelines se ejecutan cuando el sistema lo decide, pueden solaparse y no tienen una persona delante para resolver un login. Si el token caduca, el widget enseña un estado sin sesión o datos en caché; la app es la que refresca y actualiza el Keychain.

Un provider sencillo puede leer la sesión compartida así:

```swift
import WidgetKit

struct SessionEntry: TimelineEntry {
    let date: Date
    let userID: String?
}

struct SessionProvider: TimelineProvider {
    func placeholder(in context: Context) -> SessionEntry {
        SessionEntry(date: .now, userID: "preview")
    }

    func getSnapshot(in context: Context, completion: @escaping (SessionEntry) -> Void) {
        completion(entry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SessionEntry>) -> Void) {
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: .now)!
        completion(Timeline(entries: [entry()], policy: .after(next)))
    }

    private func entry() -> SessionEntry {
        let session = try? SharedSessionStore.load()
        return SessionEntry(date: .now, userID: session?.userID)
    }
}
```

Cuando la app inicia sesión, la cierra o renueva el token, pide a WidgetKit que vuelva a cargar los timelines:

```swift
import WidgetKit

WidgetCenter.shared.reloadAllTimelines()
```

Parece un detalle menor, pero evita esa sensación de que el widget «no se entera» del login. El Keychain no avisa a nadie: si quieres que el widget se actualice, tienes que decírselo.

## Apple Watch: el Keychain no cruza solo

La app del Watch tiene su propio Keychain. Puede compartirlo con sus extensiones y widgets/complicaciones mediante un access group de watchOS, pero ese grupo no es el mismo almacén que el del iPhone. Aunque el identificador sea idéntico en los entitlements, los items viven en dispositivos distintos.

Para que la app del Watch use un access group, añade Keychain Sharing al target del Watch y a sus extensiones. Sin esa capability, `kSecAttrAccessGroup` falla con `errSecMissingEntitlement`, también cuando el token llega por WatchConnectivity.

En la práctica, tienes dos estrategias válidas.

### Opción 1: WatchConnectivity

Para una app companion, es la opción más directa. La app del iPhone envía la sesión al reloj y la app del Watch la guarda en su Keychain. No depende de iCloud Keychain y te deja decidir cuándo se envía y qué se envía.

Usa `updateApplicationContext` para mantener el último estado y `sendMessage` para entregarlo cuanto antes si el reloj está accesible. Activa `WCSession` lo antes posible y trátala como un canal con entrega diferida: el sistema decide cuándo despertar al reloj. Para una sesión que cambia poco, el contexto suele bastar; para una acción interactiva, `sendMessage` reduce la espera.

### Opción 2: iCloud Keychain

Si necesitas que la sesión llegue al Watch sin una app companion, o quieres cubrir Family Setup, Apple plantea la sincronización de iCloud Keychain como opción. Conviene probarlo en un dispositivo real antes de depender de ello, sobre todo en Family Setup. El cambio clave es guardar el item con `kSecAttrSynchronizable` a `true`:

```swift
private static var baseQuery: [String: Any] {
    [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: service,
        kSecAttrAccount as String: account,
        kSecAttrAccessGroup as String: accessGroup,
        kSecAttrSynchronizable as String: true
    ]
}

let attributes: [String: Any] = [
    kSecValueData as String: data,
    kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
    kSecAttrSynchronizable as String: true
]
```

Si el item ya existe con `kSecAttrSynchronizable` a `false`, una consulta con `true` no lo encontrará. Para migrar, lee con `kSecAttrSynchronizableAny`, guarda el item con `true` y borra el antiguo. No cambies el atributo del item existente a ciegas.

También hay que añadir la capability de Keychain Sharing al target del Watch que vaya a leer el item. A partir de ahí, iCloud Keychain se encarga de sincronizarlo entre los dispositivos de la misma cuenta, cuando puede.

Lo bueno es que no necesitas mantener una sesión de WatchConnectivity ni que el iPhone esté cerca. Pero hay límites que hay que asumir desde el principio:

- El usuario puede desactivar iCloud Keychain.
- No está disponible en todas las regiones.
- La sincronización no es inmediata; depende de red, batería y condiciones del sistema.
- No puedes usar `ThisDeviceOnly`, porque precisamente quieres que el item salga del dispositivo.
- Estás sincronizando un access token con todos los dispositivos de la cuenta.

> **Importante:** `ThisDeviceOnly` e iCloud Keychain son incompatibles para este caso. Si necesitas sincronización, la accesibilidad debe permitirla; si necesitas que el token no salga del dispositivo, usa WatchConnectivity.
{: .doc-callout .doc-callout--important}

### Si compartes el mismo refresh token

No hacen falta tokens por dispositivo. Puedes dar al reloj el mismo refresh token que usa el iPhone. La revocación en servidor es obligatoria en cualquier logout, compartas el token o no; si lo compartes, además es lo que corta el acceso del reloj. Dicho eso, cuida estos puntos:

- **No lo persistas en `applicationContext`:** ese contexto puede sobrevivir en el dispositivo. Envía el refresh token con `sendMessage` y guárdalo en el Keychain del reloj. El `applicationContext` puede seguir llevando solo el access token.
- **Asume la ventana de exposición:** si el token se filtra antes del logout, el servidor lo aceptará hasta que lo revoques. La revocación reduce la ventana, no la elimina.
- **Rota el token y detecta la reutilización:** si el mismo refresh token se usa en iPhone y reloj, una rotación mal llevada puede invalidar al otro. Decide qué proceso renueva y cómo se propaga el token nuevo.
- **El access token ya emitido sigue vivo hasta que caduque:** la revocación del refresh token impide renovar, pero no invalida automáticamente el access token. Usa access tokens cortos o una lista de revocación.

Al cerrar sesión, revoca el refresh token en el servidor, borra los tokens locales del iPhone, el widget y el reloj, y envía el mensaje de cierre al reloj. Si el refresh token se comparte, la revocación en servidor es lo que impide que el reloj siga renovando.

El modelo `Session` de arriba mantiene el refresh token fuera del objeto compartido para que el caso base sea el más restrictivo. Si adoptas esta variante, añade el refresh token al payload de `sendMessage` y al store del reloj; no lo añadas al payload de `updateApplicationContext`.

## Login, refresco y logout

> **Importante:** Revocar el refresh token en el servidor no es opcional. Borrarlo del iPhone, del widget o del reloj no lo invalida. Si el refresh token sigue vivo, cualquiera que lo tenga puede seguir renovando la sesión. Hazlo siempre, compartas el token con el reloj o no.
{: .doc-callout .doc-callout--important}

Con estas piezas, el ciclo de vida queda bastante limpio. Después de un login correcto:

1. Guarda la sesión en el Keychain compartido.
2. Recarga los timelines del widget.
3. Envía la sesión al Watch si existe una app companion.

Cuando renueves el token, actualiza el item y repite los pasos 2 y 3. Cuando el usuario cierre sesión, revoca el refresh token en el servidor, borra el item, recarga los widgets y envía un mensaje al Apple Watch. Si el reloj comparte el mismo refresh token, la revocación en servidor también lo cubre.

```swift
import WidgetKit

struct SessionCoordinator {
    func didSignIn(_ session: Session) {
        try? SharedSessionStore.save(session)
        WidgetCenter.shared.reloadAllTimelines()
        // Envía la sesión al Watch con WatchConnectivity.
    }

    func didSignOut() {
        // Revoca el refresh token en el servidor.
        try? SharedSessionStore.delete()
        WidgetCenter.shared.reloadAllTimelines()
        // Envía el cierre de sesión al Watch con WatchConnectivity.
    }
}
```

Hay una regla que ahorra muchos problemas: **un solo proceso renueva el token**. Si la app, el widget y el reloj intentan refrescar a la vez, puedes rotar el token varias veces y dejar a alguno con una credencial invalidada. En una app companion, la app del iPhone renueva y distribuye.

La revocación del refresh token impide renovar, pero no invalida automáticamente el access token que ya está en circulación. Para cerrar esa ventana, usa access tokens cortos o una lista de revocación en el servidor.

## La decisión práctica

Si tu app tiene widget y una app companion para Apple Watch, yo empezaría por esta combinación:

- Keychain access group para la app y el widget en el iPhone.
- Keychain access group en watchOS para la app del reloj y sus extensiones.
- WatchConnectivity para llevar la sesión del iPhone al Watch.
- iCloud Keychain solo si necesitas sincronización sin companion o Family Setup, asumiendo sus límites.
- Revocación en servidor del refresh token al cerrar sesión.

Keychain compartido no lo resuelve todo por sí solo. Es una pieza excelente para compartir secretos dentro del mismo dispositivo. Para cruzar de un dispositivo a otro, la sesión se transfiere o se sincroniza, y cada opción tiene un coste distinto en seguridad, latencia y complejidad.

## Referencias

- [Sharing access to keychain items among a collection of apps](https://developer.apple.com/documentation/security/sharing-access-to-keychain-items-among-a-collection-of-apps)
- [Keychain Services](https://developer.apple.com/documentation/security/keychain-services)
- [kSecAttrSynchronizable](https://developer.apple.com/documentation/security/ksecattrsynchronizable)
- [OAuth 2.0 Token Revocation (RFC 7009)](https://www.rfc-editor.org/rfc/rfc7009)
- [WCSession](https://developer.apple.com/documentation/watchconnectivity/wcsession)
- [WidgetKit](https://developer.apple.com/documentation/widgetkit)
- [There and back again: Data transfer on Apple Watch](https://developer.apple.com/videos/play/wwdc2021/10003/)

</div>

<div class="lang-en" lang="en" markdown="1">

The scene is familiar: someone signs in to the app, opens the widget, and finds a “Sign in” message. They raise their wrist and, on Apple Watch, it is the same story. The tempting fix is to put the token in shared `UserDefaults` and move on. It is convenient, but it is also a bad idea: a token is a credential and deserves the same care as a password.

Shared Keychain helps, but only up to a point. Think of two scenarios that look alike and are not: sharing a secret **on the same device** and moving it **from one device to another**. Mix them up and you end up expecting magic from Keychain.

## Two different problems

The app and the widget run on the same iPhone. If both targets declare the same *access group*, they can read and write the same Keychain item. On the watch, the Watch app and its extensions can do the same.

The iPhone and Apple Watch are a different story. They are separate devices, and an access group does not synchronize anything between them. To get the session onto the watch, you have two options:

| Need | Mechanism |
| --- | --- |
| App + widget on the same iPhone | Keychain access group |
| App + widgets/complications on the Watch | Keychain access group on watchOS |
| iPhone ↔ Apple Watch | WatchConnectivity or iCloud Keychain |

On watchOS 9 and later, complications are built with WidgetKit; ClockKit is deprecated. The same access group covers the app and its widget extensions.

> **Important:** A Keychain access group shares items on the same device. It does not synchronize them between the iPhone and the Watch.
{: .doc-callout .doc-callout--important}

It sounds like a small difference, but it explains a lot of failures. When the widget cannot find the token, it is usually a missing entitlement or an access group that does not match. When the Watch cannot find it, the code may be fine: you may be asking Keychain to do something it cannot do.

## The session model

For this example, a small `Codable` structure is enough:

```swift
import Foundation
import Security

struct Session: Codable, Equatable, Sendable {
    let accessToken: String
    let expiresAt: Date
    let userID: String
}

enum SessionStoreError: Error {
    case unexpectedStatus(OSStatus)
    case invalidData
}
```

In this example, the `refreshToken` is not part of the shared model. The app keeps it in a private Keychain, and the widget and watch only receive the access token, which is what they need to render data and talk to the API. That is the least-privilege option, not an absolute prohibition: if you prefer the watch to refresh on its own, you can share the same refresh token. In that case, do not put it in `applicationContext`; send it with `sendMessage` and store it in the watch's Keychain. Sign-out must always revoke the refresh token on the server, whether or not you share it.

That type and the store below need to be available to the app and the widget. You can share them through an internal framework or add the same files to both targets.

> **Note:** An App Group’s `UserDefaults` is convenient for a user identifier, a last-sync date, or an onboarding flag. It is not the place for tokens, credentials, or secrets.
{: .doc-callout .doc-callout--note}

## Shared Keychain between the app and the widget

Start by enabling **Keychain Sharing** in the app and the widget extension. In Xcode, add the capability to both targets and point them at the same group. The entitlements should look roughly like this:

```xml
<key>keychain-access-groups</key>
<array>
    <string>$(AppIdentifierPrefix)com.example.shared</string>
</array>
```

Watch out for the value used at runtime: Xcode substitutes `$(AppIdentifierPrefix)` at build time, so the group already includes the Team ID. If your Team ID is `ABCDE12345`, the real group is `ABCDE12345.com.example.shared`. If you pass the group without the prefix, Keychain will not find it and may return `errSecMissingEntitlement`. You can centralize it in a constant; in production, inject it from Info.plist with `$(AppIdentifierPrefix)com.example.shared` and read it with `Bundle.main`.

```swift
// This store only keeps the access token.
// The refreshToken lives in an app-private group.
struct SharedSessionStore {
    static let service = "com.example.session"
    static let account = "current"
    static let accessGroup = "ABCDE12345.com.example.shared"

    private static var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: accessGroup,
            kSecAttrSynchronizable as String: false
        ]
    }

    static func save(_ session: Session) throws {
        let data = try JSONEncoder().encode(session)
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]

        let status = SecItemUpdate(baseQuery as CFDictionary, attributes as CFDictionary)

        if status == errSecItemNotFound {
            var item = baseQuery
            attributes.forEach { item[$0.key] = $0.value }

            let addStatus = SecItemAdd(item as CFDictionary, nil)
            guard addStatus == errSecSuccess else {
                throw SessionStoreError.unexpectedStatus(addStatus)
            }
        } else if status != errSecSuccess {
            throw SessionStoreError.unexpectedStatus(status)
        }
    }

    static func load() throws -> Session? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)

        if status == errSecItemNotFound {
            return nil
        }

        guard status == errSecSuccess else {
            throw SessionStoreError.unexpectedStatus(status)
        }

        guard let data = item as? Data else {
            throw SessionStoreError.invalidData
        }

        return try JSONDecoder().decode(Session.self, from: data)
    }

    static func delete() throws {
        let status = SecItemDelete(baseQuery as CFDictionary)

        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw SessionStoreError.unexpectedStatus(status)
        }
    }
}
```

Two details make the difference:

- `kSecAttrAccessGroup` makes the app and widget read the same item. Without it, each process searches its own space.
- `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` allows the token to be read after the first unlock, which is what a background widget needs. `WhenUnlocked` fails while the device is locked, and `ThisDeviceOnly` prevents the item from syncing to iCloud.

> **Important:** For a widget, `kSecAttrAccessibleWhenUnlocked` is not a good choice. If the extension runs while the device is locked, the read can fail with `errSecInteractionNotAllowed`. Use an accessibility class that works after the first unlock and do not depend on the screen being unlocked.
{: .doc-callout .doc-callout--important}

The other detail is about security: this `Session` only contains the access token. The `refreshToken` stays in an app-private Keychain. If the watch needs to refresh on its own, you can share the same refresh token, but send it only over `sendMessage`, store it in the watch's Keychain, and revoke it on the server at sign-out.

## The widget reads, the app refreshes

The widget should not refresh the token. Timelines run when the system decides, they can overlap, and there is no person in front of them to handle a login. If the token expires, the widget shows a signed-out state or cached data; the app refreshes and updates Keychain.

A simple provider can read the shared session:

```swift
import WidgetKit

struct SessionEntry: TimelineEntry {
    let date: Date
    let userID: String?
}

struct SessionProvider: TimelineProvider {
    func placeholder(in context: Context) -> SessionEntry {
        SessionEntry(date: .now, userID: "preview")
    }

    func getSnapshot(in context: Context, completion: @escaping (SessionEntry) -> Void) {
        completion(entry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SessionEntry>) -> Void) {
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: .now)!
        completion(Timeline(entries: [entry()], policy: .after(next)))
    }

    private func entry() -> SessionEntry {
        let session = try? SharedSessionStore.load()
        return SessionEntry(date: .now, userID: session?.userID)
    }
}
```

When the app signs in, signs out, or renews the token, ask WidgetKit to reload the timelines:

```swift
import WidgetKit

WidgetCenter.shared.reloadAllTimelines()
```

It looks like a small detail, but it prevents the feeling that the widget “does not notice” the login. Keychain does not notify anyone: if you want the widget to update, you have to tell it.

## Apple Watch: Keychain does not cross devices by itself

The Watch app has its own Keychain. It can share it with its extensions and widgets/complications through a watchOS access group, but that group is not the same store as the iPhone’s. Even if the identifier is identical in the entitlements, the items live on different devices.

For the Watch app to use an access group, add Keychain Sharing to the Watch target and its extensions. Without that capability, `kSecAttrAccessGroup` fails with `errSecMissingEntitlement`, even when the token arrives through WatchConnectivity.

In practice, you have two viable strategies.

### Option 1: WatchConnectivity

For a companion app, this is the most direct option. The iPhone app sends the session to the watch, and the Watch app stores it in its Keychain. It does not depend on iCloud Keychain, and it lets you decide when and what to send.

Use `updateApplicationContext` to keep the latest state and `sendMessage` to deliver it sooner when the watch is reachable. Activate `WCSession` as early as possible and treat it as a channel with deferred delivery: the system decides when to wake the watch. For a session that changes infrequently, the context is usually enough; for an interactive action, `sendMessage` reduces the wait.

### Option 2: iCloud Keychain

If you need the session to reach the Watch without a companion app, or you want to support Family Setup, Apple presents iCloud Keychain synchronization as an option. Test it on a real device before relying on it, especially for Family Setup. The key change is to store the item with `kSecAttrSynchronizable` set to `true`:

```swift
private static var baseQuery: [String: Any] {
    [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: service,
        kSecAttrAccount as String: account,
        kSecAttrAccessGroup as String: accessGroup,
        kSecAttrSynchronizable as String: true
    ]
}

let attributes: [String: Any] = [
    kSecValueData as String: data,
    kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
    kSecAttrSynchronizable as String: true
]
```

If the item already exists with `kSecAttrSynchronizable` set to `false`, a query with `true` will not find it. To migrate, read with `kSecAttrSynchronizableAny`, save the item with `true`, and delete the old one. Do not flip the attribute on the existing item blindly.

You also need to add the Keychain Sharing capability to the Watch target that will read the item. From there, iCloud Keychain syncs it across devices on the same account when it can.

The upside is that you do not need to maintain a WatchConnectivity session or keep the iPhone nearby. But there are limits you should accept from the start:

- The user can disable iCloud Keychain.
- It is not available in every region.
- Synchronization is not immediate; it depends on network, battery, and system conditions.
- You cannot use `ThisDeviceOnly`, because the whole point is to let the item leave the device.
- You are syncing an access token to every device on the account.

> **Important:** `ThisDeviceOnly` and iCloud Keychain are incompatible for this use case. If you need synchronization, accessibility must allow it; if you need the token to stay on the device, use WatchConnectivity.
{: .doc-callout .doc-callout--important}

### If you share the same refresh token

You do not need per-device tokens. You can give the watch the same refresh token the iPhone uses. Server-side revocation is mandatory on every sign-out, whether or not you share the token; if you share it, it is also what cuts off the watch's access. That said, mind these points:

- **Do not persist it in `applicationContext`:** that context can survive on the device. Send the refresh token with `sendMessage` and store it in the watch's Keychain. `applicationContext` can still carry only the access token.
- **Accept the exposure window:** if the token leaks before logout, the server will accept it until you revoke it. Revocation narrows the window; it does not eliminate it.
- **Rotate the token and detect reuse:** if the same refresh token is used on the iPhone and the watch, a mishandled rotation can invalidate the other. Decide which process refreshes and how the new token propagates.
- **An access token already issued remains valid until it expires:** revoking the refresh token stops renewal, but it does not automatically invalidate the access token. Use short-lived access tokens or a revocation list.

On sign-out, revoke the refresh token on the server, delete the local tokens on the iPhone, widget, and watch, and send the sign-out message to the watch. If the refresh token is shared, server-side revocation is what prevents the watch from continuing to renew.

The `Session` model above keeps the refresh token out of the shared object so the baseline is the most restrictive case. If you adopt this variant, add the refresh token to the `sendMessage` payload and the watch store; do not add it to the `updateApplicationContext` payload.

## Sign-in, refresh, and sign-out

> **Important:** Revoking the refresh token on the server is not optional. Deleting it from the iPhone, the widget, or the watch does not invalidate it. If the refresh token is still alive, anyone who has it can keep renewing the session. Do it every time, whether or not you share the token with the watch.
{: .doc-callout .doc-callout--important}

With these pieces, the lifecycle is fairly clean. After a successful sign-in:

1. Save the session in the shared Keychain.
2. Reload the widget timelines.
3. Send the session to the Watch if a companion app exists.

When you renew the token, update the item and repeat steps 2 and 3. When the user signs out, revoke the refresh token on the server, delete the item, reload the widgets, and send a message to the Apple Watch. If the watch shares the same refresh token, the server-side revocation covers it too.

```swift
import WidgetKit

struct SessionCoordinator {
    func didSignIn(_ session: Session) {
        try? SharedSessionStore.save(session)
        WidgetCenter.shared.reloadAllTimelines()
        // Send the session to the Watch with WatchConnectivity.
    }

    func didSignOut() {
        try? SharedSessionStore.delete()
        WidgetCenter.shared.reloadAllTimelines()
        // Send the sign-out to the Watch with WatchConnectivity.
    }
}
```

One rule saves a lot of trouble: **a single process refreshes the token**. If the app, the widget, and the watch all try to refresh at the same time, you can rotate the token several times and leave one of them with an invalid credential. In a companion app, the iPhone app refreshes and distributes.

Revoking the refresh token stops renewal, but it does not automatically invalidate an access token already in circulation. To close that window, use short-lived access tokens or a server-side revocation list.

## The practical decision

If your app has a widget and an Apple Watch companion app, I would start with this combination:

- A Keychain access group for the app and the widget on iPhone.
- A watchOS Keychain access group for the Watch app and its extensions.
- WatchConnectivity to move the session from iPhone to Watch.
- iCloud Keychain only if you need synchronization without a companion or for Family Setup, accepting its limits.
- Server-side refresh token revocation on sign-out.

Shared Keychain does not solve everything by itself. It is an excellent piece for sharing secrets on the same device. To cross from one device to another, the session is transferred or synchronized, and each option has a different cost in security, latency, and complexity.

## References

- [Sharing access to keychain items among a collection of apps](https://developer.apple.com/documentation/security/sharing-access-to-keychain-items-among-a-collection-of-apps)
- [Keychain Services](https://developer.apple.com/documentation/security/keychain-services)
- [kSecAttrSynchronizable](https://developer.apple.com/documentation/security/ksecattrsynchronizable)
- [OAuth 2.0 Token Revocation (RFC 7009)](https://www.rfc-editor.org/rfc/rfc7009)
- [WCSession](https://developer.apple.com/documentation/watchconnectivity/wcsession)
- [WidgetKit](https://developer.apple.com/documentation/widgetkit)
- [There and back again: Data transfer on Apple Watch](https://developer.apple.com/videos/play/wwdc2021/10003/)

</div>
