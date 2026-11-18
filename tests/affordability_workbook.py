"""Minimal xlsx writer (standard library only) for the ONS affordability workbook tests.

It reproduces only the structure the parser reads: the 21 reviewed sheet names and
the first rows of Table 1c. Output is deterministic (fixed zip timestamps).
"""
import io
import zipfile
from xml.sax.saxutils import escape

SHEETS = ['Contents', 'Metadata', 'Terms and Conditions'] + [
    f'{number}{table}' for number in range(1, 7) for table in 'abc']
TITLE = ('Table 1c - Ratio of median house price to median gross annual workplace-based '
         'earnings by country and region, England and Wales, 1997 to {last}')


def column(index):
    letters = ''
    while index:
        index, remainder = divmod(index - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters


def sheet_xml(rows):
    """rows: list of lists; str cells are inline strings, ('n', text) numeric, None empty."""
    body = []
    for number, cells in enumerate(rows, 1):
        out = []
        for index, cell in enumerate(cells, 1):
            ref = f'{column(index)}{number}'
            if cell is None:
                continue
            if isinstance(cell, tuple):
                out.append(f'<c r="{ref}"><v>{escape(cell[1])}</v></c>')
            else:
                out.append(f'<c r="{ref}" t="inlineStr"><is><t>{escape(cell)}</t></is></c>')
        body.append(f'<row r="{number}">{"".join(out)}</row>')
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            f'<sheetData>{"".join(body)}</sheetData></worksheet>')


def table_rows(values, first=1997, code='K04000001', name='England and Wales',
               average='8.19', title=None):
    """The three rows the parser reads. values: numeric text, '[x]' or None per year."""
    years = list(range(first, first + len(values)))
    header = ['Code', 'Name'] + [str(year) for year in years]
    row = [code, name] + [None if v is None else v if v == '[x]' else ('n', v) for v in values]
    if average is not None:
        header.append('5-Year Average')
        row.append(('n', average))
    return [[title or TITLE.format(last=years[-1])], header, row]


def build(rows, sheets=None, extra=None):
    """A workbook whose sheet '1c' holds `rows`; every other sheet is empty."""
    names = SHEETS if sheets is None else sheets
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as book:
        def add(name, content):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            book.writestr(info, content)
        add('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
        sheet_nodes = ''.join(
            f'<sheet name="{escape(name)}" sheetId="{i}" r:id="rId{i}"/>' for i, name in enumerate(names, 1))
        add('xl/workbook.xml',
            '<?xml version="1.0" encoding="UTF-8"?><workbook '
            'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            f'<sheets>{sheet_nodes}</sheets></workbook>')
        rel_nodes = ''.join(
            f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>'
            for i in range(1, len(names) + 1))
        add('xl/_rels/workbook.xml.rels',
            '<?xml version="1.0" encoding="UTF-8"?><Relationships '
            f'xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{rel_nodes}</Relationships>')
        for i, name in enumerate(names, 1):
            add(f'xl/worksheets/sheet{i}.xml', sheet_xml(rows if name == '1c' else []))
        for name, content in (extra or {}).items():
            add(name, content)
    return buffer.getvalue()
