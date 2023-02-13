include version
SOURCE=mf-portfolio.js
TARGET=mf-portfolio-$(VERSION).min.txt

all: $(TARGET)

setup:
	npm install

clean:
	rm -f $(TARGET)

$(TARGET): $(SOURCE)
	uglifyjs --compress --mangle -- $< | sed -e 's|^!|javascript:/*v$(VERSION)*/\(|' -e 's/;$$/\)/' > $@

test:
	eslint $(SOURCE)
