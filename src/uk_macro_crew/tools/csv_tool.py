import csv
from io import StringIO
import re
from crewai.tools import BaseTool
from pydantic import BaseModel, Field
from typing import Type
import pandas as pd

class CSVToolInput(BaseModel):
    """Input schema for CSVTool."""
    existing_csv: str = Field(..., description="The existing CSV report as a string.")
    new_data: str = Field(..., description="The new data to be added to the report.")

class CSVTool(BaseTool):
    name: str = "CSV Update Tool"
    description: str = "Updates a CSV report with new data. The tool takes the existing CSV content and the new data as input."
    args_schema: Type[BaseModel] = CSVToolInput

    def _run(self, existing_csv: str, new_data: str) -> str:
        try:
            # Use StringIO to treat the string as a file
            f = StringIO(existing_csv)
            reader = csv.reader(f)
            header = [h.strip() for h in next(reader)]
            data = [row for row in reader]

            # Process the new data
            for line in new_data.split('\n'):
                if not line.strip():
                    continue

                # Extract the indicator, value, and month from the new data
                match = re.match(r'-\s*(.*?):\s*(.*?)\s*\((\w{3}-\d{2})\)', line)
                if match:
                    indicator, value, month = match.groups()
                    indicator = indicator.strip()
                    value = value.strip()
                    month = month.strip()

                    # If the month column doesn't exist, create it
                    if month not in header:
                        header.append(month)
                        for row in data:
                            row.append("")

                    # Find the row for the indicator and update the value
                    for row in data:
                        if row and row[0].strip() == indicator:
                            try:
                                row[header.index(month)] = value
                            except ValueError:
                                return f"Error: Month '{month}' not found in header."
            
            # Sort the columns chronologically
            date_cols = [col for col in header if re.match(r'\w{3}-\d{2}', col)]
            date_cols.sort(key=lambda x: pd.to_datetime(x, format='%b-%y'))
            
            sorted_header = ['Indicator'] + date_cols
            
            # Create a mapping of old header index to new header index
            header_map = {h: sorted_header.index(h) for h in header}
            
            # Create new data list with sorted columns
            sorted_data = []
            for row in data:
                if not row:
                    continue
                new_row = ["" for _ in sorted_header]
                for i, cell in enumerate(row):
                    new_row[header_map[header[i]]] = cell
                sorted_data.append(new_row)
                
            # Write the updated data to a string
            output = StringIO()
            writer = csv.writer(output)
            writer.writerow(sorted_header)
            writer.writerows(sorted_data)

            return output.getvalue()

        except Exception as e:
            return f"Error processing CSV data: {e}"