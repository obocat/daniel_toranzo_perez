---
title: "@MainActor no es un hilo: es aislamiento"
title_en: "@MainActor is not a thread: it is isolation"
date: 2026-11-16 00:00:00
description: "Qué garantiza realmente @MainActor, dónde deja de comprobar el compilador y por qué mezclar formas de volver al main actor produce bugs de orden."
description_en: "What @MainActor really guarantees, where compiler checking stops, and why mixing ways of returning to the main actor causes ordering bugs."
lang: es
tags: [iOS, Swift, Concurrency, MainActor, Swift 6.2]
categories: blog
layout: blog
reading_time: 10
---

<div class="lang-es" lang="es" markdown="1">

`@MainActor` es una de esas anotaciones que se aprenden en cinco minutos y se entienden mal durante meses. La frase habitual —“pon `@MainActor` y ya se ejecuta en el main thread”— es una buena aproximación, pero mezcla dos ideas: el mecanismo de aislamiento y el lugar donde acaba ejecutándose el código.

En las plataformas de Apple, el main actor se ejecuta en el main thread. No es un detalle menor. Aun así, la garantía del compilador es más concreta: el estado aislado solo se toca desde el executor del main actor. Eso no significa que tu código sea seguro en todos los sentidos ni que el estado vaya a seguir igual después de un `await`.

## Qué garantiza realmente

`@MainActor` es un global actor. Cuando anotas un tipo, una propiedad o una función, el compilador comprueba que el acceso se produce en el executor de ese actor:

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

`updateFromAnywhere` puede llamarse desde cualquier contexto: el `await` hace el salto al main actor antes de ejecutar `updateName`. Dentro del método, el acceso a `name` está serializado, así que no hay dos trabajos del main actor tocándolo a la vez.

Eso es lo que garantiza `@MainActor`: aislamiento. No añade atomicidad entre dos llamadas, no impide que otro trabajo del main actor se cuele durante un `await` y no hace seguro un método `nonisolated`.

> **Importante:** En las plataformas de Apple, el main actor se ejecuta en el main thread. La garantía que añade `@MainActor` es aislamiento y serialización del estado, no que cualquier código que se ejecute en el main thread sea correcto.
{: .doc-callout .doc-callout--important}

## Dónde termina la garantía

El compilador solo puede proteger lo que alcanza a ver. Hay varios puntos en los que la promesa se queda corta o depende de una decisión tuya.

### `nonisolated`

Un método `nonisolated` no está aislado a ningún actor. Puede ejecutarse en cualquier contexto, pero no puede tocar estado aislado de forma síncrona:

```swift
@MainActor
final class ProfileModel {
    private(set) var name = "Ana"

    nonisolated func label() -> String {
        "Perfil"
    }
}
```

`label()` es seguro porque no lee `name`. Si intentas hacerlo, el compilador te obliga a volver al actor con `await`. No es una fuga: es una frontera explícita.

### `init`

El `init` de una clase `@MainActor` está aislado por defecto. Si lo marcas como `nonisolated`, puedes construir la instancia desde cualquier contexto, pero solo para inicializar sus propiedades. A partir de ahí, los métodos y el estado aislado siguen necesitando el main actor:

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

Un `nonisolated init` no abre el estado: solo permite construir la instancia fuera del actor. El estado sigue protegido.

### Swift 5 y `strict concurrency`

En Swift 5, la comprobación de concurrencia es incompleta. `@MainActor` sigue siendo una anotación, pero el compilador puede emitir avisos en lugar de errores. En Swift 6 con strict concurrency completa, las violaciones son errores.

Si el proyecto sigue en Swift 5, no asumas que el compilador está verificando todas las fronteras. Y si actualizas, prepárate para encontrar llamadas que llevaban tiempo mal anotadas.

### `@preconcurrency`, `@unchecked Sendable` y callbacks sin anotar

`@preconcurrency` sirve para importar módulos antiguos y suavizar los diagnósticos. No hace que el módulo sea seguro. `@unchecked Sendable` es una promesa tuya: el compilador deja de comprobar si el tipo se puede compartir. Por su parte, los callbacks de Objective-C o de frameworks antiguos no siempre están anotados con el actor correcto.

En esos puntos no hay una garantía rota por arte de magia: hay una frontera que el compilador no puede demostrar. Tú tienes que cerrarla.

### `MainActor.assumeIsolated`

`MainActor.assumeIsolated` es una herramienta síncrona para cuando ya sabes que estás en el main actor, pero el compilador no puede demostrarlo:

```swift
func legacyCallback(_ model: ProfileModel) {
    MainActor.assumeIsolated {
        model.updateName("Bea")
    }
}
```

No es un “quizá”. Comprueba el executor y, si no estás en él, termina con un fatal error. Úsalo solo cuando el contrato del callback garantice que ya estás en el main actor. Si no tienes esa prueba, vuelve al actor de forma normal:

```swift
func legacyCallback(_ model: ProfileModel) {
    Task { @MainActor in
        model.updateName("Bea")
    }
}
```

> **Nota:** `MainActor.assumeIsolated` no comprueba “más o menos”: comprueba el executor y falla si te equivocas. Es una afirmación, no una red de seguridad.
{: .doc-callout .doc-callout--note}

## Reentrancia: el main actor no te da exclusividad

El main actor serializa trabajos, no funciones `async` completas. Cuando una función se suspende en un `await` y se reanuda en el main actor, lo hace como un trabajo nuevo. Entre la suspensión y la reanudación puede colarse otro turno del run loop, otro evento u otra tarea.

Ahí aparece la reentrancia. Un ejemplo mínimo:

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

`run()` no perdió el hilo. Siguió en el main actor. Lo que ocurrió es que, mientras estaba suspendido, `advance()` pudo ejecutarse y cambiar el estado. Al reanudarse, `run()` se encontró con un valor distinto.

> **Importante:** El main actor serializa trabajos, no funciones `async` completas. Cada reanudación en el main actor es un trabajo nuevo; entre dos reanudaciones puede ejecutarse otro turno del run loop.
{: .doc-callout .doc-callout--important}

El matiz está en el `await`: no es “cada `await`”, sino cada reanudación que vuelve al main actor. Un `await` que no suspende no abre la puerta a otro trabajo.

## Por qué no mezclar mecanismos

La reentrancia explica por qué el estado puede cambiar entre dos tramos de una función. El orden explica por qué dos formas de volver al main actor no son equivalentes.

Hay varias formas de volver al main actor, y no son intercambiables:

- **`DispatchQueue.main.async`:** vuelve a la main queue. No hereda los valores task-local ni la prioridad de la tarea actual, y no es estructurado.
- **`Task { @MainActor in ... }`:** vuelve al main actor. Puede heredar la prioridad y los valores task-local del contexto; si guardas y cancelas la tarea, controlas su ciclo de vida, pero sigue siendo una tarea no estructurada.
- **`Task.detached { @MainActor in ... }`:** el cuerpo vuelve al main actor gracias a `@MainActor`, pero la tarea está desacoplada; no hereda prioridad ni valores task-local.
- **`await MainActor.run { ... }`:** hace un salto explícito al main actor sin crear una tarea nueva; la función se suspende y se reanuda después.

`DispatchQueue.main.async` pertenece a GCD. No participa de la estructura de tareas de Swift, no propaga valores task-local y su orden respecto a las tareas de Swift no es el mismo. `Task { @MainActor in ... }` crea una tarea y puede heredar contexto. `Task.detached` rompe esa herencia a propósito. `MainActor.run` es un salto explícito dentro de una función `async`.

> **Importante:** `Task.detached` no es una forma de volver al main actor. Si no añades `@MainActor` o `MainActor.run`, se ejecuta fuera del main actor. “async main detach” no existe como API.
{: .doc-callout .doc-callout--important}

El problema de mezclarlos no es que uno sea mejor que otro, sino que no comparten la misma cola lógica ni las mismas garantías de orden. Un `DispatchQueue.main.async` y un `Task { @MainActor in }` pueden acabar en un orden que no controlas. Si además hay un `await MainActor.run` en medio, el orden cambia otra vez.

## Swift 6.2: qué cambia y qué sigue siendo opt-in

Esta versión añadió dos piezas que afectan directamente a este problema.

La primera es el **aislamiento por defecto en `MainActor`**. Con `-default-isolation MainActor` —o la opción equivalente en Xcode— las declaraciones sin anotar de un módulo quedan aisladas al main actor. Los proyectos nuevos de Xcode 26 suelen venir con ese ajuste. Es cómodo para una app con mucha UI, pero es una decisión por módulo: una librería compartida o una capa de red no tienen por qué querer ese valor por defecto.

La segunda es `nonisolated(nonsending)`. Con el *upcoming feature* `NonisolatedNonsendingByDefault` —que se activa con Approachable Concurrency— las funciones `async` no aisladas se ejecutan por defecto en el actor de quien las llama. Si las llamas desde el main actor, se quedan en el main actor. Para forzar que salgan a un executor global, usa `@concurrent`.

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

Ese fragmento requiere Swift 6.2 y la característica activada; no compila con Swift 6.0. Lo importante es la idea: `nonisolated` ya no significa automáticamente “fuera del actor”. Si quieres salir, pide `@concurrent`.

## Reglas prácticas

No hay una única forma correcta, pero sí una buena disciplina:

- **Una convención por módulo.** Si el módulo usa la concurrencia de Swift, vuelve al main actor con `Task { @MainActor in }` o `await MainActor.run`. Si integra código GCD, aísla ese código en un adaptador y no lo repartas por todas partes.
- **Aísla en el tipo, no en cada llamada.** Marca el view model como `@MainActor` y deja que el compilador compruebe sus accesos. No llenes cada método de `MainActor.run`.
- **Revalida después de un `await`.** El estado que leíste antes de suspender puede haber cambiado. Si la operación depende de una versión concreta del estado, compruébalo al volver.
- **No uses `@unchecked Sendable` para callar al compilador.** Si lo necesitas, documenta por qué el tipo es seguro y qué invariante mantiene.
- **Reserva `assumeIsolated` para callbacks que ya se ejecutan en el main actor.** Si no puedes demostrarlo, usa un salto normal al actor.
- **Evita `Task.detached` salvo que quieras perder el contexto.** Para trabajo en segundo plano, `@concurrent` suele expresar mejor la intención.

## Un ejemplo reproducible

El siguiente ejecutable muestra dos formas de volver al main actor y cómo cambia el orden. Guárdalo como `MainActorOrderDemo.swift` y ejecuta `swiftc -parse-as-library MainActorOrderDemo.swift -o demo && ./demo`:

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

Las dos versiones vuelven al main actor. La diferencia es el orden. En la primera, el bloque de GCD se ejecuta antes de que `MainActor.run` recupere el turno. En la segunda, `MainActor.run` termina antes de que GCD ejecute su bloque. El `Task.sleep` solo mantiene vivo el proceso para que puedas ver la salida.

No conviertas esa salida en un contrato. Es una observación hecha con una versión concreta del compilador y del runtime. La lección es la contraria: si el orden importa, no mezcles mecanismos y no dependas de detalles de implementación. Elige una forma de volver al main actor, estructura la secuencia de forma explícita y prueba el flujo completo.

## Conclusión

`@MainActor` es una gran herramienta para el estado de la UI. También es una fuente de bugs sutiles cuando se confunde aislamiento con seguridad total.

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

On Apple platforms, the main actor runs on the main thread. That is not a minor detail. Still, the compiler's guarantee is more specific: isolated state is only touched from the main actor's executor. It does not mean your code is safe in every sense, or that the state will be the same after an `await`.

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

`updateFromAnywhere` can be called from any context: the `await` hops to the main actor before running `updateName`. Inside the method, access to `name` is serialized, so no two main actor jobs touch it at the same time.

That is the guarantee: isolation. It does not add atomicity across two calls, it does not prevent another main actor job from slipping in during an `await`, and it does not make a `nonisolated` method safe.

> **Important:** On Apple platforms, the main actor runs on the main thread. The guarantee `@MainActor` adds is isolation and serialization of state, not that any code running on the main thread is correct.
{: .doc-callout .doc-callout--important}

## Where the guarantee ends

The compiler can only protect what it can see. There are several places where the promise falls short or depends on a decision you make.

### `nonisolated`

A `nonisolated` method is not isolated to any actor. It can run in any context, but it cannot synchronously touch isolated state:

```swift
@MainActor
final class ProfileModel {
    private(set) var name = "Ana"

    nonisolated func label() -> String {
        "Profile"
    }
}
```

`label()` is safe because it does not read `name`. If you try to read it, the compiler forces you back to the actor with `await`. It is not a leak; it is an explicit boundary.

### `init`

A `@MainActor` class's `init` is isolated by default. If you mark it `nonisolated`, you can construct the instance from any context, but only to initialize its properties. From that point on, the isolated methods and state still need the main actor:

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

A `nonisolated init` does not expose the state: it only lets you construct the instance outside the actor. The state remains protected.

### Swift 5 and strict concurrency

In Swift 5, concurrency checking is incomplete. `@MainActor` is still an annotation, but the compiler may emit warnings instead of errors. In Swift 6 with complete strict concurrency, violations are errors.

If the project is still in Swift 5, do not assume the compiler is verifying every boundary. And if you upgrade, expect to find calls that have been misannotated for a while.

### `@preconcurrency`, `@unchecked Sendable`, and unannotated callbacks

`@preconcurrency` imports older modules and softens diagnostics. It does not make the module safe. `@unchecked Sendable` is your promise: the compiler stops checking whether the type can be shared. Callbacks from Objective-C or older frameworks, meanwhile, are not always annotated with the right actor.

At those points the guarantee is not broken by magic: there is a boundary the compiler cannot prove. You have to close it.

### `MainActor.assumeIsolated`

`MainActor.assumeIsolated` is a synchronous tool for when you already know you are on the main actor, but the compiler cannot prove it:

```swift
func legacyCallback(_ model: ProfileModel) {
    MainActor.assumeIsolated {
        model.updateName("Bea")
    }
}
```

It is not a guess: it checks the executor and, if you are not on it, stops with a fatal error. Use it only when the callback contract guarantees you are already on the main actor. If you cannot prove that, return to the actor normally:

```swift
func legacyCallback(_ model: ProfileModel) {
    Task { @MainActor in
        model.updateName("Bea")
    }
}
```

> **Note:** `MainActor.assumeIsolated` does not check "roughly": it checks the executor and fails if you are wrong. It is an assertion, not a safety net.
{: .doc-callout .doc-callout--note}

## Reentrancy: the main actor does not give you exclusivity

The main actor serializes jobs, not complete `async` functions. When a function suspends at an `await` and resumes on the main actor, it does so as a new job. Another run loop turn, another event, or another task can slip in between suspension and resumption.

That is where reentrancy appears. A minimal example:

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

The nuance is in the `await`: it is not every `await`, but every resumption that returns to the main actor. An `await` that does not suspend does not open the door to another job.

## Why not mix mechanisms

Reentrancy explains why state can change between two stretches of a function. Ordering explains why two ways of returning to the main actor are not equivalent.

There are several ways to return to the main actor, and they are not interchangeable:

- **`DispatchQueue.main.async`:** returns to the main queue. It does not inherit task-local values or the current task's priority, and it is not structured.
- **`Task { @MainActor in ... }`:** returns to the main actor. It may inherit priority and task-local values from the context; if you store and cancel the task, you control its lifetime, but it is still an unstructured task.
- **`Task.detached { @MainActor in ... }`:** the body returns to the main actor through `@MainActor`, but the task is detached; it does not inherit priority or task-local values.
- **`await MainActor.run { ... }`:** hops explicitly to the main actor without creating a new task; the function suspends and then resumes.

`DispatchQueue.main.async` belongs to GCD. It does not participate in Swift's task structure, does not propagate task-local values, and its ordering relative to Swift tasks is not the same. `Task { @MainActor in ... }` creates a task and can inherit context. `Task.detached` deliberately breaks that inheritance. `MainActor.run` is an explicit hop inside an `async` function.

> **Important:** `Task.detached` is not a way to return to the main actor. If you do not add `@MainActor` or `MainActor.run`, it runs outside the main actor. "async main detach" does not exist as an API.
{: .doc-callout .doc-callout--important}

The problem with mixing them is not that one is better than another, but that they do not share the same logical queue or the same ordering guarantees. A `DispatchQueue.main.async` and a `Task { @MainActor in }` can end up in an order you do not control. Add an `await MainActor.run` in the middle and the order changes again.

## Swift 6.2: what changes and what stays opt-in

This release added two pieces that directly affect this problem.

The first is **default isolation on `MainActor`**. With `-default-isolation MainActor` — or the equivalent Xcode setting — unannotated declarations in a module become isolated to the main actor. New Xcode 26 projects often start with that setting. It is convenient for a UI-heavy app, but it is a per-module decision: a shared library or a networking layer does not necessarily want that default.

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

That snippet requires Swift 6.2 and the feature enabled; it does not compile with Swift 6.0. The key idea is this: `nonisolated` no longer automatically means "off the actor". If you want to leave, ask for `@concurrent`.

## Practical rules

There is no single correct way, but there is good discipline:

- **One convention per module.** If the module uses Swift concurrency, return to the main actor with `Task { @MainActor in }` or `await MainActor.run`. If it integrates GCD code, isolate that code in an adapter instead of spreading it everywhere.
- **Isolate at the type level, not at every call.** Mark the view model as `@MainActor` and let the compiler check its accesses. Do not fill every method with `MainActor.run`.
- **Revalidate after an `await`.** The state you read before suspending may have changed. If the operation depends on a specific version of the state, check it when you return.
- **Do not use `@unchecked Sendable` to silence the compiler.** If you need it, document why the type is safe and which invariant it maintains.
- **Reserve `assumeIsolated` for callbacks that already run on the main actor.** If you cannot prove it, use a normal hop to the actor.
- **Avoid `Task.detached` unless you really want to lose context.** For background work, `@concurrent` usually expresses the intent better.

## A reproducible example

The following executable shows two ways of returning to the main actor and how the order changes. Save it as `MainActorOrderDemo.swift` and run `swiftc -parse-as-library MainActorOrderDemo.swift -o demo && ./demo`:

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

Both versions return to the main actor. The difference is the order. In the first, the GCD block runs before `MainActor.run` gets the turn. In the second, `MainActor.run` finishes before GCD runs its block. The `Task.sleep` only keeps the process alive so you can see the output.

Do not turn that output into a contract. It is an observation from a specific compiler and runtime. The lesson is the opposite: if order matters, do not mix mechanisms and do not depend on implementation details. Choose one way to return to the main actor, structure the sequence explicitly, and test the whole flow.

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
