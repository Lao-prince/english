const messages = new Map([
  ['Use a canonical UTC start time.', 'Укажите корректное время начала.'],
  ['Enter a valid IANA time zone.', 'Не удалось определить часовой пояс.'],
  ['A new slot must start in the future.', 'Выберите время, которое ещё не наступило.'],
  ['This time overlaps an open slot.', 'Это время пересекается с другим открытым интервалом.'],
  ['This slot does not exist.', 'Этот интервал больше недоступен.'],
  ['A booked slot cannot be closed.', 'На это время уже записались.'],
  ['This time is no longer available.', 'Это время уже недоступно для записи.'],
  ['The lesson has already started.', 'Урок уже начался. Отменить его нельзя.'],
  ['Same-day cancellation is chargeable. Review and confirm the charge.', 'Сегодня отмена платная. Ознакомьтесь с условиями и подтвердите списание.'],
  ['This booking does not exist.', 'Запись на урок не найдена.'],
  ['Student account not found.', 'Аккаунт ученика не найден.'],
  ['Booking not found.', 'Запись на урок не найдена.'],
  ['This lesson is not eligible for settlement.', 'За этот урок пока нельзя списать занятие.'],
  ['Add lesson credits before settling this lesson.', 'На балансе нет занятий. Сначала пополните его.'],
  ['This credit request ID is already in use.', 'Эта операция уже была отправлена с другими данными. Обновите баланс.'],
  ['This booking request ID is already in use.', 'Эта запись уже обрабатывалась. Обновите расписание.'],
  ['This publication ID already belongs to a different slot.', 'Этот запрос уже использован для другого времени. Обновите расписание.'],
]);

export async function apiMessage(response: Response, fallback: string) {
  if (response.status === 401) return 'Сеанс истёк. Откройте приложение заново.';
  if (response.status === 403) return 'У вас нет доступа к этому действию.';
  const data: unknown = await response.json().catch(() => null);
  if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string') {
    return messages.get(data.message) ?? fallback;
  }
  return fallback;
}
