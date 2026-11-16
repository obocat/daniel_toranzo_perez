---
title: "AttributedString: formato, enlaces y VoiceOver sin pelearse con UIKit"
title_en: "AttributedString: formatting, links, and VoiceOver without fighting UIKit"
date: 2026-11-16 09:00:00
description: "Cómo dar formato a un texto con AttributedString, gestionar enlaces con OpenURLAction y hacer que VoiceOver los reconozca como enlaces."
description_en: "How to format text with AttributedString, handle links with OpenURLAction, and make VoiceOver recognize them as links."
lang: es
tags: [iOS, SwiftUI, AttributedString, Accessibility, VoiceOver]
categories: blog
layout: blog
reading_time: 9
---

<div class="lang-es" lang="es" markdown="1">

Un párrafo con una negrita, una cursiva, un fragmento de código y dos enlaces parece un problema resuelto. Hasta que toca que VoiceOver lo lea como lo que es: texto con énfasis y enlaces, no una sola frase plana.

Durante años, hacer esto en UIKit fue un ejercicio de paciencia. `NSAttributedString` servía para pintar el texto, pero la interacción y la accesibilidad vivían en otra capa. `UILabel` ignoraba los enlaces; `UITextView` los mostraba, pero había que ajustar su comportamiento, interceptar las pulsaciones y comprobar que VoiceOver los anunciaba. Muchas apps acababan con un `onTapGesture` sobre el texto. Visualmente funcionaba; para VoiceOver, el enlace desaparecía.

`AttributedString` no elimina toda la complejidad, pero junta las piezas en un solo valor. Y, sobre todo, permite que el formato tenga significado además de apariencia.

## Dos capas: cómo se ve y qué es

El error clásico es tratar un enlace como texto azul con subrayado. Para los ojos, eso es un enlace. Para VoiceOver, no. Lo que convierte un fragmento en un enlace es el atributo `.link`, no el color.

Lo mismo pasa con la negrita y la cursiva. Puedes pintar una palabra con una fuente concreta o puedes marcar que esa palabra está enfatizada. La primera opción cambia la apariencia; la segunda también puede cambiar cómo se interpreta el texto.

```swift
import SwiftUI

struct ArticleText: View {
    private var content: AttributedString {
        var text = AttributedString("AttributedString permite mezclar formato, enlaces y semántica en un solo valor.")

        if let range = text.range(of: "formato") {
            text[range].inlinePresentationIntent = .stronglyEmphasized
        }

        if let range = text.range(of: "enlaces") {
            text[range].link = URL(string: "https://developer.apple.com/documentation/foundation/attributedstring")
            text[range].underlineStyle = .single
            text[range].foregroundColor = .accentColor
        }

        return text
    }

    var body: some View {
        Text(content)
            .font(.body)
            .tint(.accentColor)
    }
}
```

`inlinePresentationIntent` expresa la intención —énfasis fuerte, énfasis, código— y SwiftUI decide cómo representarla. Si necesitas una fuente concreta, puedes usar `.font`, pero para texto de lectura conviene partir de estilos semánticos como `.body` o `.headline` para que Dynamic Type siga funcionando.

El atributo que no es negociable es `.link`. El subrayado y el color ayudan a verlo, pero no lo convierten en un enlace. Si quitas `.link` y dejas solo el color azul, tendrás texto bonito y ningún enlace.

<figure class="post-figure">
  <img src="https://files.catbox.moe/wr6ii3.png" alt="Captura de la app de ejemplo con el título AttributedString, texto formateado y un enlace subrayado.">
  <figcaption>Una vista de ejemplo con formato semántico y un enlace real, montada sobre un marco de iPhone 15 Pro.</figcaption>
</figure>

## Markdown como punto de partida

Si el texto ya viene en Markdown, no hace falta recorrer rangos a mano:

```swift
import Foundation

func makeMarkdown() throws -> AttributedString {
    let markdown = "**Importante:** lee la [guía de AttributedString](https://developer.apple.com/documentation/foundation/attributedstring)."
    let options = AttributedString.MarkdownParsingOptions(
        interpretedSyntax: .inlineOnlyPreservingWhitespace
    )
    return try AttributedString(markdown: markdown, options: options)
}
```

`inlineOnlyPreservingWhitespace` interpreta el Markdown como texto en línea y conserva los saltos de línea. Es útil para párrafos que vienen de una API, una nota o un campo de texto, donde no quieres que un `#` se convierta en un título de pantalla.

`Text` también acepta Markdown directamente en un string. La diferencia es que `AttributedString` te deja el valor en la mano: puedes añadir atributos, cambiar un enlace, combinar varios fragmentos o pasarlo a otra capa antes de renderizarlo.

## Enlaces que se comportan como enlaces

En SwiftUI, un `Text` con un `AttributedString` que contiene `.link` ya es interactivo. No necesitas un `UITapGestureRecognizer` ni calcular qué palabra se ha pulsado.

Si quieres decidir qué ocurre con algunos enlaces, usa `OpenURLAction`:

```swift
import SwiftUI

struct LinkHandlingView: View {
    let text: AttributedString

    var body: some View {
        Text(text)
            .environment(\.openURL, OpenURLAction { url in
                guard url.scheme == "myapp" else {
                    return .systemAction
                }

                // Abre una pantalla interna o registra el evento.
                return .handled
            })
    }
}
```

- `.systemAction` deja que el sistema abra el enlace: Safari, Mail, la app que corresponda.
- `.handled` indica que ya lo has gestionado.
- `.discarded` lo ignora.

Para acciones internas, un esquema propio como `myapp://glossary/attributedstring` es suficiente. Para contenido web normal, deja que el sistema haga su trabajo. No conviertas todos los enlaces en acciones internas solo porque puedes.

## VoiceOver: el enlace tiene que existir en el árbol

Cuando `Text` encuentra un fragmento con `.link`, lo expone como un enlace. VoiceOver lo anuncia como tal y lo añade al rotor de enlaces. No hace falta añadir `.accessibilityAddTraits(.isLink)` al párrafo entero; de hecho, puede ser contraproducente.

Hay tres formas bastante habituales de romperlo:

1. Pintar el texto de azul y subrayarlo sin `.link`.
2. Usar `.onTapGesture` sobre el `Text` para abrir una pantalla.
3. Aplicar `.accessibilityElement(children: .combine)` o un `.accessibilityLabel` al párrafo completo.

Las tres convierten el párrafo en una sola parada. Visualmente sigue pareciendo un enlace; para VoiceOver, ya no lo es.

El texto del enlace también importa. «Aquí» o «más información» no dicen nada fuera de contexto. «Guía de AttributedString» sí. VoiceOver permite recorrer los enlaces con el rotor; si todos se llaman «aquí», el rotor es inútil.

Si tienes un encabezado visual, añade también la semántica:

```swift
import SwiftUI

Text("Enlaces")
    .font(.headline)
    .accessibilityAddTraits(.isHeader)
```

Prueba con el rotor de enlaces, no solo leyendo el párrafo de arriba abajo. En el simulador, activa VoiceOver o usa Accessibility Inspector. Comprueba que cada enlace aparece en el rotor, que el foco no se queda atrapado y que el orden coincide con el texto.

## El camino heredado: UILabel no es un enlace

Si mantienes UIKit, el error clásico es poner un `NSAttributedString` con `.link` en un `UILabel`. El texto se pinta, pero el enlace no se puede pulsar y VoiceOver no lo trata como un enlace. `UILabel` no es interactivo.

Para enlaces, usa un `UITextView` no editable y seleccionable:

```swift
import UIKit

final class ArticleViewController: UIViewController {
    private let textView = UITextView()

    override func viewDidLoad() {
        super.viewDidLoad()

        textView.isEditable = false
        textView.isSelectable = true
        textView.isScrollEnabled = false
        textView.backgroundColor = .clear
        textView.textContainerInset = .zero
        textView.textContainer.lineFragmentPadding = 0
        textView.adjustsFontForContentSizeCategory = true
        textView.linkTextAttributes = [
            .foregroundColor: UIColor.tintColor,
            .underlineStyle: NSUnderlineStyle.single.rawValue
        ]

        let text = NSMutableAttributedString(string: "Lee la documentación de AttributedString.")
        let range = (text.string as NSString).range(of: "documentación de AttributedString")
        text.addAttribute(
            .link,
            value: URL(string: "https://developer.apple.com/documentation/foundation/attributedstring")!,
            range: range
        )
        textView.attributedText = text
    }
}
```

El `UITextView` necesita `isSelectable = true` para que los enlaces respondan. `isEditable = false` evita que el usuario modifique el texto. Y `linkTextAttributes` solo cambia la apariencia: la semántica sigue viniendo de `.link`.

Si necesitas interceptar la pulsación, implementa el delegate. En iOS 17 y posteriores, los métodos de text item sustituyen al antiguo `shouldInteractWith`. Sea cual sea la API, no sustituyas el enlace por un gesto sobre toda la vista.

## La decisión práctica

| Necesito | Uso |
| --- | --- |
| Varios enlaces dentro de un párrafo en SwiftUI | `AttributedString` + `Text` |
| Decidir qué hace un enlace | `OpenURLAction` |
| Un enlace suelto y aislado | `Link` |
| Texto con enlaces en UIKit | `UITextView` |
| Que VoiceOver lo reconozca | atributo `.link`, no color ni subrayado |

El formato no es decoración. Un enlace es una promesa de navegación; si solo lo parece, la promesa se rompe para quien no lo ve. `AttributedString` no es solo una API más cómoda: es una forma de que el texto lleve su significado consigo.

</div>

<div class="lang-en" lang="en" markdown="1">

A paragraph with bold, italic, a code fragment, and two links sounds like a solved problem. Then VoiceOver has to read it as what it is: text with emphasis and links, not one flat sentence.

For years, doing this in UIKit took patience. `NSAttributedString` handled the appearance, but interaction and accessibility lived in another layer. `UILabel` ignored links; `UITextView` displayed them, but you had to tune its behavior, intercept taps, and check that VoiceOver announced them. Many apps ended up with an `onTapGesture` on the text. It worked visually; for VoiceOver, the link disappeared.

`AttributedString` does not remove every sharp edge, but it brings the pieces into one value. More importantly, it lets formatting carry meaning, not just appearance.

## Two layers: how it looks and what it is

The classic mistake is treating a link as blue, underlined text. To your eyes, that is a link. To VoiceOver, it is not. What turns a run into a link is the `.link` attribute, not the color.

The same applies to bold and italic. You can paint a word with a specific font, or you can mark that the word is emphasized. The first changes appearance; the second can also change how the text is interpreted.

```swift
import SwiftUI

struct ArticleText: View {
    private var content: AttributedString {
        var text = AttributedString("AttributedString can mix formatting, links, and semantics in a single value.")

        if let range = text.range(of: "formatting") {
            text[range].inlinePresentationIntent = .stronglyEmphasized
        }

        if let range = text.range(of: "links") {
            text[range].link = URL(string: "https://developer.apple.com/documentation/foundation/attributedstring")
            text[range].underlineStyle = .single
            text[range].foregroundColor = .accentColor
        }

        return text
    }

    var body: some View {
        Text(content)
            .font(.body)
            .tint(.accentColor)
    }
}
```

`inlinePresentationIntent` expresses intent — strong emphasis, emphasis, code — and SwiftUI decides how to render it. If you need a specific font, you can use `.font`, but for reading text it is better to start from semantic styles such as `.body` or `.headline` so Dynamic Type keeps working.

The non-negotiable attribute is `.link`. Underline and color help people see it, but they do not make it a link. Remove `.link` and keep the blue color, and you have pretty text with no link at all.

<figure class="post-figure">
  <img src="https://files.catbox.moe/w18tdo.png" alt="Screenshot of the sample app with the AttributedString title, formatted text, and an underlined link.">
  <figcaption>An example view with semantic formatting and a real link, mounted in an iPhone 15 Pro frame.</figcaption>
</figure>

## Markdown as a starting point

If the text already arrives as Markdown, you do not need to walk ranges by hand:

```swift
import Foundation

func makeMarkdown() throws -> AttributedString {
    let markdown = "**Important:** read the [AttributedString guide](https://developer.apple.com/documentation/foundation/attributedstring)."
    let options = AttributedString.MarkdownParsingOptions(
        interpretedSyntax: .inlineOnlyPreservingWhitespace
    )
    return try AttributedString(markdown: markdown, options: options)
}
```

`inlineOnlyPreservingWhitespace` parses Markdown as inline text and preserves line breaks. It is useful for paragraphs that come from an API, a note, or a text field, where you do not want a `#` to become a screen title.

`Text` also accepts Markdown directly in a string. The difference is that `AttributedString` leaves the value in your hands: you can add attributes, replace a link, combine fragments, or pass it to another layer before rendering it.

## Links that behave like links

In SwiftUI, a `Text` backed by an `AttributedString` with `.link` is already interactive. You do not need a `UITapGestureRecognizer` or code that works out which word was tapped.

If you want to decide what happens to some links, use `OpenURLAction`:

```swift
import SwiftUI

struct LinkHandlingView: View {
    let text: AttributedString

    var body: some View {
        Text(text)
            .environment(\.openURL, OpenURLAction { url in
                guard url.scheme == "myapp" else {
                    return .systemAction
                }

                // Open an internal screen or record the event.
                return .handled
            })
    }
}
```

- `.systemAction` lets the system open the link: Safari, Mail, or the matching app.
- `.handled` means you have already handled it.
- `.discarded` ignores it.

For internal actions, a custom scheme such as `myapp://glossary/attributedstring` is enough. For ordinary web content, let the system do its job. Do not turn every link into an internal action just because you can.

## VoiceOver: the link has to exist in the tree

When `Text` finds a run with `.link`, it exposes it as a link. VoiceOver announces it as a link and adds it to the links rotor. You do not need to add `.accessibilityAddTraits(.isLink)` to the whole paragraph; in fact, it can backfire.

There are three common ways to break it:

1. Paint the text blue and underline it without `.link`.
2. Use `.onTapGesture` on the `Text` to open a screen.
3. Apply `.accessibilityElement(children: .combine)` or an `.accessibilityLabel` to the entire paragraph.

All three collapse the paragraph into a single stop. It still looks like a link; to VoiceOver, it is no longer one.

Link text matters too. “Here” or “more information” says nothing out of context. “AttributedString guide” does. VoiceOver lets people move through links with the rotor; if every link is called “here”, the rotor is useless.

If you have a visual heading, add the semantics too:

```swift
import SwiftUI

Text("Links")
    .font(.headline)
    .accessibilityAddTraits(.isHeader)
```

Test with the links rotor, not just by reading the paragraph from top to bottom. In the simulator, turn on VoiceOver or use Accessibility Inspector. Check that each link appears in the rotor, that focus does not get trapped, and that the order matches the text.

## The legacy path: UILabel is not a link

If you still maintain UIKit, the classic mistake is putting an `NSAttributedString` with `.link` into a `UILabel`. The text renders, but the link cannot be tapped and VoiceOver does not treat it as a link. `UILabel` is not interactive.

For links, use a non-editable, selectable `UITextView`:

```swift
import UIKit

final class ArticleViewController: UIViewController {
    private let textView = UITextView()

    override func viewDidLoad() {
        super.viewDidLoad()

        textView.isEditable = false
        textView.isSelectable = true
        textView.isScrollEnabled = false
        textView.backgroundColor = .clear
        textView.textContainerInset = .zero
        textView.textContainer.lineFragmentPadding = 0
        textView.adjustsFontForContentSizeCategory = true
        textView.linkTextAttributes = [
            .foregroundColor: UIColor.tintColor,
            .underlineStyle: NSUnderlineStyle.single.rawValue
        ]

        let text = NSMutableAttributedString(string: "Read the AttributedString documentation.")
        let range = (text.string as NSString).range(of: "AttributedString documentation")
        text.addAttribute(
            .link,
            value: URL(string: "https://developer.apple.com/documentation/foundation/attributedstring")!,
            range: range
        )
        textView.attributedText = text
    }
}
```

`UITextView` needs `isSelectable = true` for links to respond. `isEditable = false` keeps people from changing the text. And `linkTextAttributes` only changes appearance: the semantics still come from `.link`.

If you need to intercept the tap, implement the delegate. On iOS 17 and later, the text item methods replace the old `shouldInteractWith`. Whatever API you use, do not replace the link with a gesture on the whole view.

## The practical decision

| I need | I use |
| --- | --- |
| Several links inside a SwiftUI paragraph | `AttributedString` + `Text` |
| Decide what a link does | `OpenURLAction` |
| A single, isolated link | `Link` |
| Text with links in UIKit | `UITextView` |
| VoiceOver to recognize it | the `.link` attribute, not color or underline |

Formatting is not decoration. A link is a navigation promise; if it only looks like one, the promise breaks for people who cannot see it. `AttributedString` is not just a more convenient API: it is a way for text to carry its meaning with it.

</div>
