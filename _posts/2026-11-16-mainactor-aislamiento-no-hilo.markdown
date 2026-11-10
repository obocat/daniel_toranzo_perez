---
title: "@MainActor no es un hilo: es aislamiento"
title_en: "@MainActor is not a thread: it is isolation"
date: 2026-11-16 00:00:00
description: "Qué garantiza realmente @MainActor, dónde deja de comprobar el compilador y por qué mezclar formas de volver al main produce bugs de orden."
description_en: "What @MainActor really guarantees, where compiler checking stops, and why mixing ways of returning to main causes ordering bugs."
lang: es
tags: [iOS, Swift, Concurrency, MainActor, Swift 6.2]
categories: blog
layout: blog
reading_time: 10
---

<div class="lang-es" lang="es" markdown="1">

`@MainActor` es una de esas anotaciones que se aprenden en cinco minutos y se entienden mal durante meses. La frase habitual —“pon `@MainActor` y ya se ejecuta en el main thread”— es una buena aproximación, pero mezcla dos ideas: el mecanismo de aislamiento y el lugar donde acaba ejecutándose el código.

En Apple platforms, el main actor usa el main thread. Eso no es un detalle menor. Pero lo que el compilador garantiza es más concreto: el estado aislado solo se toca desde el executor del main actor. Esa garantía no dice que tu código sea seguro en todos los sentidos, ni que el estado siga igual después de un `await`.

## Qué garantiza realmente

`@MainActor` es un global actor. Al anotar un tipo, una propiedad o una función, el compilador comprueba que el acceso se hace desde el executor de ese actor:

```swift
@MainActor
final class ProfileModel {
    private(set) var name = "Ana"

    func updateName(_ newName: String) {
        name = newName
    }
}

func updateFromAnywhere(_ model: ProfileModel) async {
    await model.updateName("Bea")
}
```

La función `updateFromAnywhere` puede llamarse desde cualquier contexto. El `await` se encarga de llegar al main actor antes de ejecutar `updateName`. Dentro del método, el acceso a `name` está serializado: no hay dos trabajos del main actor tocándolo a la vez.

Eso es lo que compra `@MainActor`: aislamiento. No compra atomicidad entre dos llamadas, no impide que otro trabajo del main actor se cuele en un `await` y no convierte en seguro un método `nonisolated`.

> **Importante:** En Apple platforms, el main actor se ejecuta en el main thread. La garantía que añade `@MainActor` es aislamiento y serialización del estado, no que cualquier código que toque main sea correcto.
{: .doc-callout .doc-callout--important}

## Dónde se acaba la garantía

El compilador solo puede proteger lo que ve. Hay varios puntos donde la promesa se queda corta o depende de una decisión tuya.

### `nonisolated`

Un método `nonisolated` no pertenece a ningún actor. Puede ejecutarse en cualquier contexto y no puede tocar estado aislado de forma síncrona:

```swift
@MainActor
final class ProfileModel {
    private(set) var name = "Ana"

    nonisolated func label() -> String {
        "Perfil"
    }
}
```

`label()` es seguro porque no lee `name`. Si intentas leerlo desde ahí, el compilador te obliga a volver al actor con `await`. No es una fuga: es una frontera explícita.

### `init`

El `init` de una clase `@MainActor` está aislado por defecto. Si lo marcas como `nonisolated`, puedes construir la instancia desde cualquier contexto, pero solo estás inicializando sus propiedades. Después, los métodos y el estado aislado siguen necesitando el main actor:

```swift
@MainActor
final class ProfileModel {
    var name: String

    nonisolated init(name: String) {
        self.name = name
    }

    func updateName(_ newName: String) {
        name = newName
    }
}
```

Un `nonisolated init` no es una puerta trasera al estado. Es una puerta delante de la construcción.

### Swift 5 y `strict concurrency`

En Swift 5, la comprobación de concurrencia es incompleta. `@MainActor` sigue siendo una anotación, pero el compilador puede emitir avisos en lugar de errores. En Swift 6 con strict concurrency completa, las violaciones son errores.

Si el proyecto sigue en Swift 5, no asumas que el compilador está verificando todas las fronteras. Y si actualizas, prepárate para encontrar llamadas que llevaban tiempo mal anotadas.

### `@preconcurrency`, `@unchecked Sendable` y callbacks sin anotar

`@preconcurrency` sirve para importar módulos antiguos y rebajar los diagnósticos. No hace que el módulo sea seguro. `@unchecked Sendable` es una promesa tuya: el compilador deja de comprobar si el tipo se puede compartir. Y los callbacks de Objective-C o de frameworks antiguos no siempre están anotados con el actor correcto.

En esos puntos no hay una garantía rota por arte de magia: hay una frontera que el compilador no puede demostrar. Tú tienes que cerrarla.

### `MainActor.assumeIsolated`

`MainActor.assumeIsolated` es una herramienta sincrónica para cuando ya sabes que estás en el main actor pero el compilador no lo sabe:

```swift
func legacyCallback(_ model: ProfileModel) {
    MainActor.assumeIsolated {
        model.updateName("Bea")
    }
}
```

No es un “quizá”. Comprueba el executor y, si no estás en él, termina con un fatal error. Úsalo solo cuando el contrato del callback garantice que ya estás en main. Si no tienes esa prueba, vuelve al actor de forma normal:

```swift
func legacyCallback(_ model: ProfileModel) {
    Task { @MainActor in
        model.updateName("Bea")
    }
}
```

> **Nota:** `MainActor.assumeIsolated` no comprueba “más o menos”: comprueba el executor y falla si te equivocas. Es una afirmación, no una red de seguridad.
{: .doc-callout .doc-callout--note}

## Un ciclo de main, pero no cualquiera

El main actor serializa trabajos, no funciones `async` completas. Cada vez que una función se suspende en un `await` y vuelve al main actor, se reanuda como un trabajo nuevo. Entre la suspensión y la reanudación puede ejecutarse otro turno del run loop, otro evento o otra tarea.

Ese es el terreno de la reentrancia. Un ejemplo mínimo:

```swift
import Foundation

@MainActor
final class StepModel {
    var step = 0

    func run() async {
        step = 1
        print("before await:", step)
        await Task.yield()
        print("after await:", step)
    }

    func advance() {
        step = 2
        print("advanced:", step)
    }
}

@main
struct ReentrancyDemo {
    @MainActor
    static func main() async {
        let model = StepModel()
        let task = Task { @MainActor in
            await model.run()
        }

        await Task.yield()
        model.advance()
        await task.value
    }
}
```

En mi ejecución, la salida es:

```text
before await: 1
advanced: 2
after await: 2
```

`run()` no perdió el hilo. Siguió en el main actor. Lo que pasó es que, mientras estaba suspendido, `advance()` pudo ejecutarse y cambiar el estado. Al reanudarse, `run()` se encontró con un valor distinto.

> **Importante:** El main actor serializa trabajos, no funciones `async` completas. Cada reanudación en el main actor es un trabajo nuevo; entre dos reanudaciones puede ejecutarse otro turno del run loop.
{: .doc-callout .doc-callout--important}

Y un matiz importante: no es “cada `await`”. Es cada reanudación que vuelve al main actor. Un `await` que no suspende no abre la puerta a otro trabajo.

> **Nota:** No es “cada `await`”: es cada reanudación en el actor. Un `await` que no suspende no provoca un cambio de turno.
{: .doc-callout .doc-callout--note}

## Por qué no mezclar mecanismos

Hay varias formas de volver al main, y no son intercambiables:

- **`DispatchQueue.main.async`:** vuelve a la main queue. No hereda task-locals ni la prioridad de la tarea actual; no es estructurado.
- **`Task { @MainActor in ... }`:** vuelve al main actor. Puede heredar prioridad y task-locals del contexto; si guardas y cancelas la tarea, controlas su ciclo de vida, pero sigue siendo una tarea no estructurada.
- **`Task.detached { @MainActor in ... }`:** el cuerpo vuelve al main por `@MainActor`, pero la tarea está desacoplada; no hereda prioridad ni task-locals.
- **`await MainActor.run { ... }`:** vuelve al main actor sin crear una tarea nueva; suspende y vuelve.

`DispatchQueue.main.async` es GCD. No participa de la estructura de tareas de Swift, no propaga task-local values y su relación de orden con tareas de Swift no es la misma. `Task { @MainActor in ... }` crea una tarea y puede heredar contexto. `Task.detached` rompe esa herencia a propósito. `MainActor.run` es un salto explícito dentro de una función `async`.

> **Importante:** `Task.detached` no es una forma de volver al main. Si no añades `@MainActor` o `MainActor.run`, se ejecuta fuera. “async main detach” no existe como API.
{: .doc-callout .doc-callout--important}

El problema de mezclarlos no es que uno sea “mejor”. Es que no comparten la misma cola lógica ni las mismas garantías de orden. Un `DispatchQueue.main.async` y un `Task { @MainActor in }` pueden ejecutarse en un orden que no controlas. Si además hay un `await MainActor.run` en medio, el orden cambia otra vez.

## Swift 6.2: el panorama cambió, pero no para todos

Swift 6.2 añadió dos piezas que afectan directamente a esta conversación.

La primera es el **aislamiento por defecto en `MainActor`**. Con `-default-isolation MainActor` —o la opción equivalente en Xcode— las declaraciones sin anotar de un módulo pasan a estar aisladas al main actor. Los proyectos nuevos de Xcode 26 suelen venir con ese ajuste. Es cómodo para una app de UI, pero es una decisión por módulo: una librería compartida o una capa de red no tienen por qué querer ese valor por defecto.

La segunda es `nonisolated(nonsending)`. Con el upcoming feature `NonisolatedNonsendingByDefault` —que se activa con Approachable Concurrency— las funciones `async` no aisladas se ejecutan en el actor del llamador por defecto. Si las llamas desde el main actor, se quedan en el main actor. Para forzar que salgan a un executor global, se usa `@concurrent`.

```swift
import Foundation

struct MetadataLoader: Sendable {
    func load() async -> String {
        // Swift 6.2 + NonisolatedNonsendingByDefault:
        // se ejecuta en el actor del caller.
        "metadata"
    }

    @concurrent
    func decode() async -> Data {
        // Siempre sale al executor global.
        Data()
    }
}
```

Ese snippet requiere Swift 6.2 y el feature activado; no compila con Swift 6.0. La idea es la importante: `nonisolated` ya no significa automáticamente “fuera del actor”. Si quieres salir, pide `@concurrent`.

## Reglas prácticas

No hay una única forma correcta, pero sí una buena disciplina:

- **Una convención por módulo.** Si el módulo usa Swift concurrency, vuelve al main con `Task { @MainActor in }` o `await MainActor.run`. Si integra código GCD, aísla ese código en un adaptador y no lo repartas por todas partes.
- **Aísla en el tipo, no en cada llamada.** Marca el view model como `@MainActor` y deja que el compilador compruebe sus accesos. No llenes cada método de `MainActor.run`.
- **Revalida después de un `await`.** El estado que leíste antes de suspender puede haber cambiado. Si la operación depende de una versión concreta del estado, compruébalo al volver.
- **No uses `@unchecked Sendable` para callar al compilador.** Si lo necesitas, documenta por qué el tipo es seguro y qué invariant mantiene.
- **Reserva `assumeIsolated` para callbacks con contrato de main.** Si no puedes demostrarlo, usa un salto normal al actor.
- **Evita `Task.detached` salvo que quieras perder contexto.** Para trabajo de fondo, `@concurrent` suele expresar mejor la intención.

## Un ejemplo reproducible

El siguiente ejecutable muestra dos formas de volver al main y cómo cambia el orden. Guárdalo como `MainActorOrderDemo.swift` y ejecuta `swiftc -parse-as-library MainActorOrderDemo.swift -o demo && ./demo`:

```swift
import Foundation

@main
struct MainActorOrderDemo {
    @MainActor
    static func main() async {
        print("dispatch first")
        await dispatchFirst()

        print("run first")
        await runFirst()
    }

    @MainActor
    static func dispatchFirst() async {
        print("1 start")
        DispatchQueue.main.async {
            print("3 dispatch")
        }
        await MainActor.run {
            print("2 run")
        }
        print("4 end")
        try? await Task.sleep(nanoseconds: 20_000_000)
    }

    @MainActor
    static func runFirst() async {
        print("1 start")
        await MainActor.run {
            print("2 run")
        }
        DispatchQueue.main.async {
            print("3 dispatch")
        }
        print("4 end")
        try? await Task.sleep(nanoseconds: 20_000_000)
    }
}
```

Salida observada:

```text
dispatch first
1 start
3 dispatch
2 run
4 end
run first
1 start
2 run
4 end
3 dispatch
```

Las dos versiones vuelven al main. La diferencia es el orden. En la primera, el bloque de GCD se ejecuta antes de que `MainActor.run` recupere el turno. En la segunda, `MainActor.run` termina antes de que GCD ejecute su bloque. El `Task.sleep` solo mantiene vivo el proceso para que puedas ver la salida.

No conviertas esa salida en un contrato. Es una observación de una toolchain concreta. La lección es la contraria: si el orden importa, no mezcles mecanismos y no dependas de detalles de implementación. Elige una forma de volver al main, estructura la secuencia de forma explícita y prueba el flujo completo.

## Conclusión

`@MainActor` es una gran herramienta para el estado de UI. También es una fuente de bugs sutiles cuando se confunde aislamiento con seguridad total.

El compilador te dice dónde puedes tocar el estado. No te dice cuándo, ni en qué orden, ni qué ha cambiado mientras esperabas. Esa parte sigue siendo diseño de concurrencia.

Si tienes que recordar una frase: **`@MainActor` garantiza aislamiento, no inmunidad**.

## Referencias

- [MainActor](https://developer.apple.com/documentation/swift/mainactor)
- [`MainActor.assumeIsolated`](https://developer.apple.com/documentation/swift/mainactor/assumeisolated%28_%3Afile%3Aline%3A%29)
- [Swift 6.2 released](https://www.swift.org/blog/swift-6.2-released/)
- [SE-0461: Run nonisolated async functions on the caller's actor by default](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0461-async-function-isolation.md)
- [SE-0466: Control default actor isolation inference](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0466-control-default-actor-isolation.md)
- [nonisolated(nonsending) by default](https://docs.swift.org/compiler/documentation/diagnostics/nonisolated-nonsending-by-default/)
- [WWDC25: Embracing Swift concurrency](https://developer.apple.com/videos/play/wwdc2025/268/)

</div>

<div class="lang-en" lang="en" markdown="1">

`@MainActor` is one of those annotations you learn in five minutes and misunderstand for months. The usual line — "add `@MainActor` and it runs on the main thread" — is a good approximation, but it mixes two ideas: the isolation mechanism and the place where the code ends up running.

On Apple platforms, the main actor uses the main thread. That is not a minor detail. But what the compiler guarantees is more specific: isolated state is only touched from the main actor's executor. That guarantee does not say your code is safe in every sense, nor that the state is the same after an `await`.

## What it really guarantees

`@MainActor` is a global actor. When you annotate a type, a property, or a function, the compiler checks that access happens on that actor's executor:

```swift
@MainActor
final class ProfileModel {
    private(set) var name = "Ana"

    func updateName(_ newName: String) {
        name = newName
    }
}

func updateFromAnywhere(_ model: ProfileModel) async {
    await model.updateName("Bea")
}
```

`updateFromAnywhere` can be called from any context. The `await` takes care of reaching the main actor before running `updateName`. Inside the method, access to `name` is serialized: no two main actor jobs touch it at the same time.

That is what `@MainActor` buys you: isolation. It does not buy atomicity across two calls, it does not prevent another main actor job from slipping in at an `await`, and it does not make a `nonisolated` method safe.

> **Important:** On Apple platforms, the main actor runs on the main thread. The guarantee `@MainActor` adds is isolation and serialization of state, not that any code touching main is correct.
{: .doc-callout .doc-callout--important}

## Where the guarantee ends

The compiler can only protect what it can see. There are several places where the promise falls short or depends on a decision you make.

### `nonisolated`

A `nonisolated` method belongs to no actor. It can run in any context and cannot synchronously touch isolated state:

```swift
@MainActor
final class ProfileModel {
    private(set) var name = "Ana"

    nonisolated func label() -> String {
        "Profile"
    }
}
```

`label()` is safe because it does not read `name`. If you try to read it there, the compiler forces you back to the actor with `await`. It is not a leak; it is an explicit boundary.

### `init`

A `@MainActor` class's `init` is isolated by default. If you mark it `nonisolated`, you can construct the instance from any context, but you are only initializing its properties. After that, the isolated methods and state still need the main actor:

```swift
@MainActor
final class ProfileModel {
    var name: String

    nonisolated init(name: String) {
        self.name = name
    }

    func updateName(_ newName: String) {
        name = newName
    }
}
```

A `nonisolated init` is not a back door to state. It is a door in front of construction.

### Swift 5 and strict concurrency

In Swift 5, concurrency checking is incomplete. `@MainActor` is still an annotation, but the compiler may emit warnings instead of errors. In Swift 6 with complete strict concurrency, violations are errors.

If the project is still in Swift 5, do not assume the compiler is verifying every boundary. And if you upgrade, expect to find calls that have been misannotated for a while.

### `@preconcurrency`, `@unchecked Sendable`, and unannotated callbacks

`@preconcurrency` imports older modules and softens diagnostics. It does not make the module safe. `@unchecked Sendable` is your promise: the compiler stops checking whether the type can be shared. And callbacks from Objective-C or older frameworks are not always annotated with the right actor.

At those points the guarantee is not broken by magic: there is a boundary the compiler cannot prove. You have to close it.

### `MainActor.assumeIsolated`

`MainActor.assumeIsolated` is a synchronous tool for when you already know you are on the main actor but the compiler does not:

```swift
func legacyCallback(_ model: ProfileModel) {
    MainActor.assumeIsolated {
        model.updateName("Bea")
    }
}
```

It is not a "maybe". It checks the executor and, if you are not on it, stops with a fatal error. Use it only when the callback's contract guarantees you are already on main. If you cannot prove that, return to the actor normally:

```swift
func legacyCallback(_ model: ProfileModel) {
    Task { @MainActor in
        model.updateName("Bea")
    }
}
```

> **Note:** `MainActor.assumeIsolated` does not check "roughly": it checks the executor and fails if you are wrong. It is an assertion, not a safety net.
{: .doc-callout .doc-callout--note}

## A main cycle, but not just any cycle

The main actor serializes jobs, not complete `async` functions. Every time a function suspends at an `await` and returns to the main actor, it resumes as a new job. Another run loop turn, another event, or another task can run between suspension and resumption.

That is the land of reentrancy. A minimal example:

```swift
import Foundation

@MainActor
final class StepModel {
    var step = 0

    func run() async {
        step = 1
        print("before await:", step)
        await Task.yield()
        print("after await:", step)
    }

    func advance() {
        step = 2
        print("advanced:", step)
    }
}

@main
struct ReentrancyDemo {
    @MainActor
    static func main() async {
        let model = StepModel()
        let task = Task { @MainActor in
            await model.run()
        }

        await Task.yield()
        model.advance()
        await task.value
    }
}
```

In my run, the output is:

```text
before await: 1
advanced: 2
after await: 2
```

`run()` did not lose the thread. It stayed on the main actor. What happened is that, while it was suspended, `advance()` was able to run and change the state. When `run()` resumed, it found a different value.

> **Important:** The main actor serializes jobs, not complete `async` functions. Every resumption on the main actor is a new job; another run loop turn can run between two resumptions.
{: .doc-callout .doc-callout--important}

And an important nuance: it is not "every `await`". It is every resumption that returns to the main actor. An `await` that does not suspend does not open the door to another job.

> **Note:** It is not "every `await`": it is every resumption on the actor. An `await` that does not suspend does not hand over the turn.
{: .doc-callout .doc-callout--note}

## Why not mix mechanisms

There are several ways to return to main, and they are not interchangeable:

- **`DispatchQueue.main.async`:** returns to the main queue. It does not inherit task-locals or the current task's priority, and it is not structured.
- **`Task { @MainActor in ... }`:** returns to the main actor. It may inherit priority and task-locals from the context; if you store and cancel the task, you control its lifetime, but it is still an unstructured task.
- **`Task.detached { @MainActor in ... }`:** the body returns to main through `@MainActor`, but the task is detached; it does not inherit priority or task-locals.
- **`await MainActor.run { ... }`:** returns to the main actor without creating a new task; it suspends and returns.

`DispatchQueue.main.async` is GCD. It does not participate in Swift's task structure, it does not propagate task-local values, and its ordering relationship with Swift tasks is not the same. `Task { @MainActor in ... }` creates a task and can inherit context. `Task.detached` deliberately breaks that inheritance. `MainActor.run` is an explicit hop inside an `async` function.

> **Important:** `Task.detached` is not a way to return to main. If you do not add `@MainActor` or `MainActor.run`, it runs outside. "async main detach" does not exist as an API.
{: .doc-callout .doc-callout--important}

The problem with mixing them is not that one is "better". It is that they do not share the same logical queue or the same ordering guarantees. A `DispatchQueue.main.async` and a `Task { @MainActor in }` can run in an order you do not control. Add an `await MainActor.run` in the middle and the order changes again.

## Swift 6.2: the landscape changed, but not for everyone

Swift 6.2 added two pieces that directly affect this conversation.

The first is **default isolation on `MainActor`**. With `-default-isolation MainActor` — or the equivalent Xcode setting — unannotated declarations in a module become isolated to the main actor. New Xcode 26 projects often start with that setting. It is convenient for a UI app, but it is a per-module decision: a shared library or a networking layer does not necessarily want that default.

The second is `nonisolated(nonsending)`. With the `NonisolatedNonsendingByDefault` upcoming feature — enabled by Approachable Concurrency — nonisolated `async` functions run on the caller's actor by default. If you call them from the main actor, they stay on the main actor. To force them onto a global executor, use `@concurrent`.

```swift
import Foundation

struct MetadataLoader: Sendable {
    func load() async -> String {
        // Swift 6.2 + NonisolatedNonsendingByDefault:
        // runs on the caller's actor.
        "metadata"
    }

    @concurrent
    func decode() async -> Data {
        // Always leaves for the global executor.
        Data()
    }
}
```

That snippet requires Swift 6.2 and the feature enabled; it does not compile with Swift 6.0. The important idea is this: `nonisolated` no longer automatically means "off the actor". If you want to leave, ask for `@concurrent`.

## Practical rules

There is no single correct way, but there is good discipline:

- **One convention per module.** If the module uses Swift concurrency, return to main with `Task { @MainActor in }` or `await MainActor.run`. If it integrates GCD code, isolate that code in an adapter instead of spreading it everywhere.
- **Isolate at the type level, not at every call.** Mark the view model as `@MainActor` and let the compiler check its accesses. Do not fill every method with `MainActor.run`.
- **Revalidate after an `await`.** The state you read before suspending may have changed. If the operation depends on a specific version of the state, check it when you return.
- **Do not use `@unchecked Sendable` to silence the compiler.** If you need it, document why the type is safe and which invariant it maintains.
- **Reserve `assumeIsolated` for callbacks with a main-actor contract.** If you cannot prove it, use a normal hop to the actor.
- **Avoid `Task.detached` unless you really want to lose context.** For background work, `@concurrent` usually expresses the intent better.

## A reproducible example

The following executable shows two ways of returning to main and how the order changes. Save it as `MainActorOrderDemo.swift` and run `swiftc -parse-as-library MainActorOrderDemo.swift -o demo && ./demo`:

```swift
import Foundation

@main
struct MainActorOrderDemo {
    @MainActor
    static func main() async {
        print("dispatch first")
        await dispatchFirst()

        print("run first")
        await runFirst()
    }

    @MainActor
    static func dispatchFirst() async {
        print("1 start")
        DispatchQueue.main.async {
            print("3 dispatch")
        }
        await MainActor.run {
            print("2 run")
        }
        print("4 end")
        try? await Task.sleep(nanoseconds: 20_000_000)
    }

    @MainActor
    static func runFirst() async {
        print("1 start")
        await MainActor.run {
            print("2 run")
        }
        DispatchQueue.main.async {
            print("3 dispatch")
        }
        print("4 end")
        try? await Task.sleep(nanoseconds: 20_000_000)
    }
}
```

Observed output:

```text
dispatch first
1 start
3 dispatch
2 run
4 end
run first
1 start
2 run
4 end
3 dispatch
```

Both versions return to main. The difference is the order. In the first, the GCD block runs before `MainActor.run` gets the turn. In the second, `MainActor.run` finishes before GCD runs its block. The `Task.sleep` only keeps the process alive so you can see the output.

Do not turn that output into a contract. It is an observation from a specific toolchain. The lesson is the opposite: if order matters, do not mix mechanisms and do not depend on implementation details. Choose one way to return to main, structure the sequence explicitly, and test the whole flow.

## Conclusion

`@MainActor` is a great tool for UI state. It is also a source of subtle bugs when isolation is confused with total safety.

The compiler tells you where you can touch state. It does not tell you when, in what order, or what changed while you were waiting. That part is still concurrency design.

If you have to remember one sentence: **`@MainActor` guarantees isolation, not immunity**.

## References

- [MainActor](https://developer.apple.com/documentation/swift/mainactor)
- [`MainActor.assumeIsolated`](https://developer.apple.com/documentation/swift/mainactor/assumeisolated%28_%3Afile%3Aline%3A%29)
- [Swift 6.2 released](https://www.swift.org/blog/swift-6.2-released/)
- [SE-0461: Run nonisolated async functions on the caller's actor by default](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0461-async-function-isolation.md)
- [SE-0466: Control default actor isolation inference](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0466-control-default-actor-isolation.md)
- [nonisolated(nonsending) by default](https://docs.swift.org/compiler/documentation/diagnostics/nonisolated-nonsending-by-default/)
- [WWDC25: Embracing Swift concurrency](https://developer.apple.com/videos/play/wwdc2025/268/)

</div>
