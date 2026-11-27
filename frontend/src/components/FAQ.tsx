import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  CircleHelp,
  FileImage,
  Highlighter,
  Search,
  ShieldCheck,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import "./faq.css";

interface FAQItem {
  question: string;
  answer: string;
  note?: {
    type: "tip" | "warning";
    text: string;
  };
}

interface FAQSection {
  id: string;
  title: string;
  Icon: LucideIcon;
  items: FAQItem[];
}

interface FAQProps {
  onClose: () => void;
}

const FAQ_SECTIONS: FAQSection[] = [
  {
    id: "getting-started",
    title: "Начало работы",
    Icon: Upload,
    items: [
      {
        question: "Для чего нужен сайт?",
        answer:
          "Сайт распознаёт текст на фотографиях рукописных конспектов. Результат OCR можно просмотреть и исправить, а на оригинальное изображение — отдельно добавить рисунки и пометки.",
      },
      {
        question: "Как зарегистрироваться и войти?",
        answer:
          "На экране входа нажмите «Регистрация», укажите email и пароль, затем войдите в аккаунт. Если аккаунт уже создан, используйте форму «Вход».",
      },
      {
        question: "Как загрузить рукописный конспект?",
        answer:
          "На главном экране перетащите файл в область загрузки или нажмите на неё и выберите изображение. После загрузки запись появится в истории.",
      },
      {
        question: "Какие изображения поддерживаются?",
        answer:
          "Поддерживаются JPG/JPEG, PNG и WEBP. Максимальный размер файла — 10 МБ.",
      },
    ],
  },
  {
    id: "ocr",
    title: "Распознавание текста (OCR)",
    Icon: Search,
    items: [
      {
        question: "Как открыть загруженный конспект?",
        answer:
          "Нажмите на нужную запись в истории загрузок. Для изображения сначала откроется экран с результатом OCR.",
      },
      {
        question: "Как работает распознавание рукописного русского текста?",
        answer:
          "Распознавание запускается автоматически при загрузке изображения. Сайт использует режим распознавания рукописного текста и передаёт русскую и английскую языковые подсказки. Результат может содержать ошибки, особенно если изображение нечёткое или почерк сложно разобрать.",
      },
      {
        question: "Где посмотреть результат распознавания?",
        answer:
          "Результат показан в текстовом поле на экране OCR заметки. Пока вы не включили редактирование, поле доступно только для просмотра.",
      },
      {
        question: "Как сохранить исправленный результат OCR?",
        answer:
          "Нажмите «Редактировать», внесите правки и выберите «Сохранить изменения».",
      },
      {
        question: "Что делать, если текст распознался неправильно?",
        answer:
          "Откройте редактирование OCR, исправьте текст вручную и сохраните его. Повторный запуск распознавания для уже загруженной заметки в интерфейсе сейчас не предусмотрен.",
        note: {
          type: "tip",
          text: "При пустом результате можно так же открыть редактирование и ввести текст вручную.",
        },
      },
    ],
  },
  {
    id: "image-editor",
    title: "Редактирование изображения",
    Icon: FileImage,
    items: [
      {
        question: "Как перейти в редактор изображения?",
        answer:
          "На экране OCR нажмите «Редактировать изображение» в верхней панели. Откроется редактор поверх оригинальной картинки.",
      },
      {
        question: "Как рисовать пером или карандашом?",
        answer:
          "Выберите инструмент «Перо» и рисуйте по изображению мышью или касанием. Инструмент «Перо» выполняет роль карандаша.",
      },
      {
        question: "Как пользоваться маркером?",
        answer:
          "Выберите «Маркер», задайте цвет и толщину, затем проведите по нужному месту. Маркер рисует полупрозрачную линию.",
      },
      {
        question: "Как работает ластик?",
        answer:
          "Выберите «Ластик» и проведите по части рисунка, которую нужно убрать. Ластик стирает участок мазка, не удаляя оригинальную картинку.",
      },
      {
        question: "Как добавить текст?",
        answer:
          "Выберите инструмент «Текст» и нажмите на изображение. Появится редактируемый текстовый блок; введите текст и настройте размер и начертание.",
      },
      {
        question: "Какие фигуры можно добавить?",
        answer:
          "Доступны линия, стрелка, прямоугольник и круг. Выберите фигуру и протяните указатель по изображению, чтобы задать её размер.",
      },
      {
        question: "Как выделять, перемещать и менять размер объектов?",
        answer:
          "Выберите инструмент «Выбор», нажмите на объект, затем перетащите его или потяните за маркеры изменения размера. Выбранный объект можно удалить кнопкой «Удалить».",
      },
      {
        question: "Как менять цвет и толщину?",
        answer:
          "Используйте палитру цвета и ползунок толщины на панели инструментов. Для текста вместо толщины доступна настройка размера текста.",
      },
      {
        question: "Как отменить или повторить действие?",
        answer:
          "Нажмите кнопку отмены (Undo), чтобы отменить последнее действие, или кнопку повтора (Redo), чтобы вернуть отменённое действие.",
      },
      {
        question: "Как увеличить или уменьшить изображение?",
        answer:
          "Используйте кнопки «+» и «−» либо ползунок масштаба. Доступный диапазон — от 50% до 300%.",
      },
      {
        question: "Как перемещаться по увеличенному изображению?",
        answer:
          "Выберите инструмент «Перемещение» и перетащите изображение в нужную сторону.",
      },
      {
        question: "Как сохраняются аннотации и как вернуться к OCR?",
        answer:
          "Изменения аннотаций сохраняются автоматически после короткой паузы. Статус показывается вверху редактора; при ошибке используйте «Повторить сохранение». Чтобы вернуться к тексту, нажмите «К результатам OCR». Перед переходом редактор пытается сохранить ожидающие изменения.",
      },
    ],
  },
  {
    id: "saving-security",
    title: "Сохранение и безопасность",
    Icon: ShieldCheck,
    items: [
      {
        question: "Оригинальное изображение меняется при редактировании?",
        answer:
          "Нет. Рисунки и текстовые объекты хранятся отдельно и отображаются поверх оригинала. Исходный файл не перезаписывается.",
      },
      {
        question: "Где хранятся изменения?",
        answer:
          "Аннотации сохраняются отдельно от изображения и привязаны к заметке и её владельцу. OCR-текст сохраняется отдельно от аннотаций.",
      },
      {
        question: "Что происходит при повторном открытии заметки?",
        answer:
          "Редактор заново загружает оригинальное изображение и сохранённые аннотации. Результат OCR остаётся доступен на экране заметки.",
      },
      {
        question: "Что удаляется вместе с заметкой?",
        answer:
          "Удаление заметки удаляет её сохранённые аннотации и связанный оригинальный файл. Если у старой записи нет подтверждённой связи с файлом, сервер оставляет этот файл, чтобы не удалить его по ошибке.",
        note: {
          type: "warning",
          text: "Удаление заметки нельзя отменить. Перед удалением проверьте, что выбрана нужная запись.",
        },
      },
    ],
  },
  {
    id: "troubleshooting",
    title: "Частые проблемы",
    Icon: AlertTriangle,
    items: [
      {
        question: "Что делать, если оригинальное изображение недоступно?",
        answer:
          "У некоторых старых заметок отсутствует подтверждённая привязка к оригинальному файлу. В этом случае редактор покажет сообщение об ошибке, а безопасно подобрать файл автоматически нельзя. Результат OCR остаётся отдельным от оригинала.",
        note: {
          type: "warning",
          text: "Не удаляйте заметку в надежде восстановить оригинал: это не создаст отсутствующую связь.",
        },
      },
      {
        question: "Что делать, если OCR не распознал текст?",
        answer:
          "Распознавание выполняется при загрузке и может завершиться без результата. Откройте экран OCR, нажмите «Редактировать», введите текст вручную и сохраните изменения. Кнопки повторного распознавания нет.",
      },
      {
        question: "Что делать, если изменения не отображаются?",
        answer:
          "В редакторе дождитесь статуса «Сохранено». Если появилась ошибка, нажмите «Повторить сохранение». Затем вернитесь к заметке и откройте её снова, чтобы загрузить сохранённое состояние.",
      },
      {
        question: "Что делать, если редактор долго загружается?",
        answer:
          "Редактор загружает оригинал и аннотации. Подождите завершения загрузки. Если отображается ошибка загрузки аннотаций, используйте «Повторить загрузку». Если оригинал недоступен, редактор покажет отдельное сообщение.",
      },
      {
        question: "Как связаться с поддержкой?",
        answer:
          "В приложении сейчас нет встроенной формы или ссылки для обращения в поддержку.",
      },
    ],
  },
];

export default function FAQ({ onClose }: FAQProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const sections = useMemo(
    () =>
      FAQ_SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          const searchableText = `${item.question} ${item.answer} ${item.note?.text ?? ""}`;
          return searchableText.toLocaleLowerCase().includes(normalizedQuery);
        }),
      })).filter((section) => section.items.length > 0),
    [normalizedQuery],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="faq-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="faq-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="faq-title"
      >
        <header className="faq-header">
          <div className="faq-heading">
            <CircleHelp size={24} aria-hidden="true" />
            <div>
              <p className="faq-eyebrow">Справочный центр</p>
              <h1 id="faq-title">FAQ — помощь</h1>
            </div>
          </div>
          <button
            type="button"
            className="faq-close-button"
            onClick={onClose}
            aria-label="Закрыть помощь"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <label className="faq-search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти ответ…"
            aria-label="Поиск по вопросам и ответам"
            autoFocus
          />
        </label>

        <div className="faq-layout">
          <nav className="faq-navigation" aria-label="Разделы помощи">
            {sections.map(({ id, title, Icon }) => (
              <a key={id} href={`#${id}`}>
                <Icon size={17} aria-hidden="true" />
                <span>{title}</span>
              </a>
            ))}
          </nav>

          <div className="faq-content">
            {sections.length === 0 ? (
              <div className="faq-empty" role="status">
                <Search size={24} aria-hidden="true" />
                <p>По запросу «{query}» ничего не найдено.</p>
                <span>Попробуйте другие слова.</span>
              </div>
            ) : (
              sections.map(({ id, title, Icon, items }) => (
                <section className="faq-section" id={id} key={id}>
                  <h2>
                    <Icon size={20} aria-hidden="true" />
                    {title}
                  </h2>
                  <div className="faq-items">
                    {items.map(({ question, answer, note }) => (
                      <details className="faq-item" key={question}>
                        <summary>
                          <span>{question}</span>
                          <ChevronDown size={18} aria-hidden="true" />
                        </summary>
                        <div className="faq-answer">
                          <p>{answer}</p>
                          {note && (
                            <div className={`faq-note faq-note-${note.type}`}>
                              {note.type === "warning" ? (
                                <AlertTriangle size={17} aria-hidden="true" />
                              ) : (
                                <Highlighter size={17} aria-hidden="true" />
                              )}
                              <span>{note.text}</span>
                            </div>
                          )}
                        </div>
                      </details>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
