from __future__ import annotations

from datetime import date

import pytest
from sqlmodel import Session, SQLModel, create_engine

from app.models import Member, Order
from app.services.member_service import MemberService


@pytest.fixture()
def session() -> Session:
  engine = create_engine('sqlite://', connect_args={'check_same_thread': False})
  SQLModel.metadata.create_all(engine)
  with Session(engine) as session:
    yield session


def _member(session: Session, name: str, birthday: date | None = None) -> Member:
  member = Member(name=name, birthday=birthday, member_code=f'M-{name}')
  session.add(member)
  session.commit()
  session.refresh(member)
  return member


def _order(session: Session, member: Member, total: float, cancelled: bool = False, is_exchange: bool = False) -> None:
  session.add(Order(member_id=member.id, total_price=total, is_cancelled=cancelled, is_exchange=is_exchange))
  session.commit()


def _list(session: Session, **kwargs):
  page = kwargs.pop('page', 1)
  size = kwargs.pop('size', 50)
  return MemberService(session).list(page, size, (page - 1) * size, **kwargs)


def test_sort_by_total_spent_desc(session):
  a = _member(session, 'A')
  b = _member(session, 'B')
  c = _member(session, 'C')  # 無消費
  _order(session, a, 300)
  _order(session, b, 500)
  _order(session, a, 100)

  result = _list(session, sort='total_spent', sort_dir='desc')

  assert [m.name for m in result.data] == ['B', 'A', 'C']
  assert [m.total_spent for m in result.data] == [500, 400, 0]


def test_sort_by_total_spent_asc(session):
  a = _member(session, 'A')
  b = _member(session, 'B')
  _order(session, a, 300)
  _order(session, b, 100)

  result = _list(session, sort='total_spent', sort_dir='asc')

  assert [m.name for m in result.data] == ['B', 'A']


def test_total_spent_excludes_cancelled_and_nets_exchange(session):
  a = _member(session, 'A')
  _order(session, a, 1000)
  _order(session, a, 999, cancelled=True)
  _order(session, a, -200, is_exchange=True)  # 換貨退差額

  result = _list(session, sort='total_spent')

  assert result.data[0].total_spent == 800


def test_ties_are_stably_ordered_across_pages(session):
  members = [_member(session, f'M{i}') for i in range(5)]
  for m in members:
    _order(session, m, 100)

  page1 = _list(session, sort='total_spent', page=1, size=2)
  page2 = _list(session, sort='total_spent', page=2, size=2)
  page3 = _list(session, sort='total_spent', page=3, size=2)

  ids = [m.id for p in (page1, page2, page3) for m in p.data]
  assert len(ids) == 5 and len(set(ids)) == 5


def test_filter_by_birthday_month(session):
  _member(session, 'Mar1', date(1990, 3, 15))
  _member(session, 'Mar2', date(2001, 3, 2))
  _member(session, 'Apr', date(1990, 4, 1))
  _member(session, 'NoBirthday')

  result = _list(session, birthday_month=3)

  assert result.total == 2
  assert {m.name for m in result.data} == {'Mar1', 'Mar2'}


def test_birthday_month_combined_with_search_and_total(session):
  a = _member(session, 'Amy', date(1990, 5, 1))
  b = _member(session, 'Bob', date(1990, 5, 2))
  _member(session, 'Amber', date(1990, 6, 1))
  _order(session, a, 100)
  _order(session, b, 900)

  result = _list(session, q='Am', birthday_month=5, sort='total_spent')
  assert result.total == 1
  assert [m.name for m in result.data] == ['Amy']

  result = _list(session, birthday_month=5, sort='total_spent')
  assert [m.name for m in result.data] == ['Bob', 'Amy']


def test_sort_by_birthday_ignores_year_and_puts_missing_last(session):
  _member(session, 'Dec', date(2000, 12, 1))
  _member(session, 'Jan', date(1980, 1, 20))
  _member(session, 'None')
  _member(session, 'Jan5', date(1999, 1, 5))

  result = _list(session, sort='birthday', sort_dir='asc')

  assert [m.name for m in result.data] == ['Jan5', 'Jan', 'Dec', 'None']


def test_total_count_matches_filters(session):
  for i in range(3):
    _member(session, f'Feb{i}', date(1990, 2, i + 1))
  _member(session, 'Jul', date(1990, 7, 1))

  result = _list(session, birthday_month=2, page=1, size=2)

  assert result.total == 3
  assert len(result.data) == 2
